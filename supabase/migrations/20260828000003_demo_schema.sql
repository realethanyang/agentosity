-- demo schema:与 public 同构的演示数据世界(demo.agentosity.com 使用)
create schema if not exists demo;
grant usage on schema demo to anon, authenticated, service_role;
alter default privileges in schema demo grant all on tables to service_role;
alter default privileges in schema demo grant all on functions to service_role;
set local search_path = demo, public;

-- Agentosity / 下班榜 — 初始 schema
-- 时区口径:Asia/Shanghai;打卡日 = 当地 5:00 ~ 次日 4:59;有效打卡 = 12:00 之后(0:00-4:59 归前一天并 +24h)

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  industry_tags text[] not null default '{}',
  city_tags text[] not null default '{}',
  source text not null default 'builtin' check (source in ('builtin', 'user_created')),
  created_at timestamptz not null default now()
);

create table checkins (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_token text not null,
  clocked_at timestamptz not null,
  day_key date not null,
  backfill boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_token, day_key)
);
create index checkins_company_day_idx on checkins (company_id, day_key);
create index checkins_day_idx on checkins (day_key);

create table agent_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_token text,
  harness text not null default 'unknown',
  probe text not null default 'none',
  started_at timestamptz not null default now(),
  last_heartbeat_at timestamptz not null default now(),
  ended_at timestamptz,
  active_seconds integer not null default 0,
  created_at timestamptz not null default now()
);
create index agent_sessions_company_idx on agent_sessions (company_id, started_at);
create index agent_sessions_live_idx on agent_sessions (last_heartbeat_at) where ended_at is null;

-- 计算打卡归属日(5:00 分界,Asia/Shanghai)
create or replace function day_key_of(ts timestamptz) returns date
language sql immutable as $$
  select ((ts at time zone 'Asia/Shanghai') - interval '5 hours')::date
$$;

-- 有效打卡 + 分钟数(跨零点 +1440)
create or replace view checkins_valid as
select
  c.*,
  case
    when ((c.clocked_at at time zone 'Asia/Shanghai')::time) < time '05:00'
      then extract(epoch from (c.clocked_at at time zone 'Asia/Shanghai')::time) / 60 + 1440
    else extract(epoch from (c.clocked_at at time zone 'Asia/Shanghai')::time) / 60
  end as minutes_of_day
from checkins c
where ((c.clocked_at at time zone 'Asia/Shanghai')::time) >= time '12:00'
   or ((c.clocked_at at time zone 'Asia/Shanghai')::time) < time '05:00';

-- 公司 × 日 人类下班统计(仅工作日进主榜,由查询侧过滤)
create or replace view company_daily_human as
select
  cv.company_id,
  cv.day_key,
  avg(cv.minutes_of_day) as avg_minutes,
  count(*) as checkin_count
from checkins_valid cv
group by cv.company_id, cv.day_key;

-- Agent 会话有效结束时间:显式 end 优先,否则最后心跳
create or replace view agent_sessions_effective as
select
  s.*,
  coalesce(s.ended_at, s.last_heartbeat_at) as effective_end,
  greatest(extract(epoch from (coalesce(s.ended_at, s.last_heartbeat_at) - s.started_at)), 0) as session_seconds,
  (s.ended_at is null and s.last_heartbeat_at > now() - interval '3 minutes') as is_live,
  day_key_of(s.started_at) as day_key
from agent_sessions s;

-- 公司 × 日 Agent 统计
create or replace view company_daily_agents as
select
  e.company_id,
  e.day_key,
  sum(e.session_seconds) / 3600.0 as session_hours,
  sum(e.active_seconds) / 3600.0 as active_hours,
  count(*) as daa,
  -- Agent Overtime:当地 19:00 之后的会话时长(仅按开始日粗算,MVP 口径)
  sum(
    greatest(
      extract(epoch from (
        least(e.effective_end, (e.day_key + interval '1 day 5 hours') at time zone 'Asia/Shanghai')
        - greatest(e.started_at, (e.day_key + interval '19 hours') at time zone 'Asia/Shanghai')
      )),
      0
    )
  ) / 3600.0 as overtime_hours
from agent_sessions_effective e
group by e.company_id, e.day_key;

-- RLS:全表拒绝匿名直连,一切读写走服务端 API(service role 绕过 RLS)
alter table companies enable row level security;
alter table checkins enable row level security;
alter table agent_sessions enable row level security;

-- API 层 SQL 函数:榜单 / 我的排名 / Agent 榜 / 在岗实况
-- 全部 security definer 由服务端 service role 调用;人类榜只公布前三的规则在这里落地

-- 揭榜:某日榜单(只返回前三)+ 三数卡片(今日实时/揭榜日/一周)
create or replace function fn_board(p_day date, p_tag_type text default null, p_tag text default null)
returns json language plpgsql stable as $$
declare
  result json;
begin
  with scoped_companies as (
    select c.id from companies c
    where p_tag_type is null
       or (p_tag_type = 'industry' and p_tag = any(c.industry_tags))
       or (p_tag_type = 'city' and p_tag = any(c.city_tags))
  ),
  ranked as (
    select c.name, h.avg_minutes, h.checkin_count,
           row_number() over (order by h.avg_minutes asc, h.checkin_count desc) as rn
    from company_daily_human h
    join companies c on c.id = h.company_id
    where h.day_key = p_day and h.company_id in (select id from scoped_companies)
  ),
  today_stat as (
    select avg(v.minutes_of_day) as m from checkins_valid v
    where v.day_key = day_key_of(now()) and v.company_id in (select id from scoped_companies)
  ),
  day_stat as (
    select avg(v.minutes_of_day) as m from checkins_valid v
    where v.day_key = p_day and v.company_id in (select id from scoped_companies)
  ),
  week_stat as (
    select avg(v.minutes_of_day) as m from checkins_valid v
    where v.day_key between p_day - 6 and p_day and v.company_id in (select id from scoped_companies)
  )
  select json_build_object(
    'day', p_day,
    'top3', coalesce((
      select json_agg(json_build_object('rank', rn, 'name', name, 'avg_minutes', round(avg_minutes), 'count', checkin_count) order by rn)
      from ranked where rn <= 3), '[]'::json),
    'company_count', (select count(*) from ranked),
    'stats', json_build_object(
      'today_avg', (select round(m) from today_stat),
      'day_avg', (select round(m) from day_stat),
      'week_avg', (select round(m) from week_stat)
    )
  ) into result;
  return result;
end $$;

-- 我的排名(私信逻辑):按设备最近一次打卡的公司,给出该公司在揭榜日的名次与距前三差距
create or replace function fn_my_rank(p_device text, p_day date)
returns json language plpgsql stable as $$
declare
  my_company uuid;
  result json;
begin
  select company_id into my_company from checkins
  where user_token = p_device order by clocked_at desc limit 1;

  if my_company is null then
    return json_build_object('found', false);
  end if;

  with ranked as (
    select h.company_id, c.name, h.avg_minutes, h.checkin_count,
           row_number() over (order by h.avg_minutes asc, h.checkin_count desc) as rn,
           count(*) over () as total
    from company_daily_human h
    join companies c on c.id = h.company_id
    where h.day_key = p_day
  ),
  third as (select avg_minutes from ranked where rn = 3)
  select json_build_object(
    'found', true,
    'day', p_day,
    'company', r.name,
    'rank', r.rn,
    'total', r.total,
    'avg_minutes', round(r.avg_minutes),
    'checkin_count', r.checkin_count,
    'gap_to_top3', case when r.rn <= 3 then 0 else round(r.avg_minutes - (select avg_minutes from third)) end
  ) into result
  from ranked r where r.company_id = my_company;

  return coalesce(result, json_build_object('found', true, 'day', p_day, 'no_data', true));
end $$;

-- Agentosity 公司榜:近 N 天 Active Agent-Hours 排序 + DAA/Overtime/Leverage/在岗
create or replace function fn_agents_board(p_from date, p_to date)
returns json language sql stable as $$
  with agg as (
    select a.company_id,
           sum(a.active_hours) as active_hours,
           sum(a.session_hours) as session_hours,
           sum(a.overtime_hours) as overtime_hours,
           sum(a.daa) as sessions
    from company_daily_agents a
    where a.day_key between p_from and p_to
    group by a.company_id
  ),
  human as (
    -- 人类工时估算:假定 9:00 上班,checkin_count × (下班分钟 - 540)
    select h.company_id,
           sum(h.checkin_count * greatest(h.avg_minutes - 540, 60) / 60.0) as human_hours
    from company_daily_human h
    where h.day_key between p_from and p_to
    group by h.company_id
  ),
  live as (
    select e.company_id, count(*) as n from agent_sessions_effective e where e.is_live group by e.company_id
  )
  select coalesce(json_agg(json_build_object(
    'name', c.name,
    'active_hours', round(agg.active_hours::numeric, 1),
    'session_hours', round(agg.session_hours::numeric, 1),
    'overtime_hours', round(agg.overtime_hours::numeric, 1),
    'sessions', agg.sessions,
    'human_hours', round(coalesce(human.human_hours, 0)::numeric, 1),
    'leverage', case when coalesce(human.human_hours, 0) > 0
                     then round((agg.active_hours / human.human_hours)::numeric, 2) end,
    'live_now', coalesce(live.n, 0)
  ) order by agg.active_hours desc), '[]'::json)
  from agg
  join companies c on c.id = agg.company_id
  left join human on human.company_id = agg.company_id
  left join live on live.company_id = agg.company_id
$$;

-- 在岗实况:现在还有多少 agent 在上班
create or replace function fn_live_agents()
returns json language sql stable as $$
  select json_build_object(
    'total', (select count(*) from agent_sessions_effective where is_live),
    'by_company', coalesce((
      select json_agg(json_build_object('name', c.name, 'harness', e.harness,
        'since_minutes', round(extract(epoch from (now() - e.started_at)) / 60)) order by e.started_at)
      from agent_sessions_effective e join companies c on c.id = e.company_id
      where e.is_live), '[]'::json)
  )
$$;

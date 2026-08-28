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

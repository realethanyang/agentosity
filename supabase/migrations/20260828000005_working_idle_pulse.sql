-- Working/Idle 拆分 + 人类实时脉搏。public 与 demo 两个世界各执行一遍。
-- 注:view 用 drop+create(s.* 展开会因新表列改变列序,create or replace 不允许)

alter table public.agent_sessions add column if not exists last_active_at timestamptz;
alter table demo.agent_sessions add column if not exists last_active_at timestamptz;

-- ========== public ==========
set local search_path = public;

drop view if exists company_daily_agents;
drop view if exists agent_sessions_effective;

create view agent_sessions_effective as
select
  s.*,
  coalesce(s.ended_at, s.last_heartbeat_at) as effective_end,
  greatest(extract(epoch from (coalesce(s.ended_at, s.last_heartbeat_at) - s.started_at)), 0) as session_seconds,
  (s.ended_at is null and s.last_heartbeat_at > now() - interval '3 minutes') as is_live,
  (s.ended_at is null and s.last_heartbeat_at > now() - interval '3 minutes'
    and s.last_active_at is not null and s.last_active_at > now() - interval '3 minutes') as is_working,
  day_key_of(s.started_at) as day_key
from agent_sessions s;

create view company_daily_agents as
select
  e.company_id,
  e.day_key,
  sum(e.session_seconds) / 3600.0 as session_hours,
  sum(e.active_seconds) / 3600.0 as active_hours,
  count(*) as daa,
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

create or replace function fn_live_agents()
returns json language sql stable as $$
  select json_build_object(
    'total', (select count(*) from agent_sessions_effective where is_live),
    'working', (select count(*) from agent_sessions_effective where is_working),
    'idle', (select count(*) from agent_sessions_effective where is_live and not is_working),
    'by_company', coalesce((
      select json_agg(json_build_object('name', c.name, 'harness', e.harness,
        'working', e.is_working,
        'since_minutes', round(extract(epoch from (now() - e.started_at)) / 60)) order by e.started_at)
      from agent_sessions_effective e join companies c on c.id = e.company_id
      where e.is_live), '[]'::json)
  )
$$;

-- 人类实时脉搏:今天已下班 / 在册未打卡 / 全员撤离的公司
create or replace function fn_pulse()
returns json language sql stable as $$
  with today as (
    select distinct user_token, company_id from checkins where day_key = day_key_of(now())
  ),
  roster as (
    select distinct user_token, company_id from checkins
    where day_key between day_key_of(now()) - 6 and day_key_of(now())
  ),
  comp as (
    select r.company_id,
           count(distinct r.user_token) as roster_n,
           count(distinct t.user_token) as out_n
    from roster r
    left join today t on t.user_token = r.user_token and t.company_id = r.company_id
    group by r.company_id
  )
  select json_build_object(
    'checked_out', (select count(distinct user_token) from today),
    'still_working', greatest(
      (select count(distinct user_token) from roster) - (select count(distinct user_token) from today), 0),
    'companies_all_out', (select count(*) from comp where roster_n > 0 and out_n >= roster_n),
    'companies_total', (select count(*) from comp)
  )
$$;

-- ========== demo ==========
set local search_path = demo, public;

drop view if exists company_daily_agents;
drop view if exists agent_sessions_effective;

create view agent_sessions_effective as
select
  s.*,
  coalesce(s.ended_at, s.last_heartbeat_at) as effective_end,
  greatest(extract(epoch from (coalesce(s.ended_at, s.last_heartbeat_at) - s.started_at)), 0) as session_seconds,
  (s.ended_at is null and s.last_heartbeat_at > now() - interval '3 minutes') as is_live,
  (s.ended_at is null and s.last_heartbeat_at > now() - interval '3 minutes'
    and s.last_active_at is not null and s.last_active_at > now() - interval '3 minutes') as is_working,
  day_key_of(s.started_at) as day_key
from agent_sessions s;

create view company_daily_agents as
select
  e.company_id,
  e.day_key,
  sum(e.session_seconds) / 3600.0 as session_hours,
  sum(e.active_seconds) / 3600.0 as active_hours,
  count(*) as daa,
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

create or replace function fn_live_agents()
returns json language sql stable as $$
  select json_build_object(
    'total', (select count(*) from agent_sessions_effective where is_live),
    'working', (select count(*) from agent_sessions_effective where is_working),
    'idle', (select count(*) from agent_sessions_effective where is_live and not is_working),
    'by_company', coalesce((
      select json_agg(json_build_object('name', c.name, 'harness', e.harness,
        'working', e.is_working,
        'since_minutes', round(extract(epoch from (now() - e.started_at)) / 60)) order by e.started_at)
      from agent_sessions_effective e join companies c on c.id = e.company_id
      where e.is_live), '[]'::json)
  )
$$;

-- 人类实时脉搏:今天已下班 / 在册未打卡 / 全员撤离的公司
create or replace function fn_pulse()
returns json language sql stable as $$
  with today as (
    select distinct user_token, company_id from checkins where day_key = day_key_of(now())
  ),
  roster as (
    select distinct user_token, company_id from checkins
    where day_key between day_key_of(now()) - 6 and day_key_of(now())
  ),
  comp as (
    select r.company_id,
           count(distinct r.user_token) as roster_n,
           count(distinct t.user_token) as out_n
    from roster r
    left join today t on t.user_token = r.user_token and t.company_id = r.company_id
    group by r.company_id
  )
  select json_build_object(
    'checked_out', (select count(distinct user_token) from today),
    'still_working', greatest(
      (select count(distinct user_token) from roster) - (select count(distinct user_token) from today), 0),
    'companies_all_out', (select count(*) from comp where roster_n > 0 and out_n >= roster_n),
    'companies_total', (select count(*) from comp)
  )
$$;

-- 脉搏分母修复:在册身份 = 打卡 ∪ agent 会话

-- ========== public ==========
set local search_path = public;

-- 修分母:在册 = 打过卡 或 有 agent 会话 的身份(此前只算打过卡的,新用户装了考勤没打卡就被分母漏掉)
create or replace function fn_pulse()
returns json language sql stable as $$
  with roster as (
    select distinct user_token from checkins
    where day_key between day_key_of(now()) - 6 and day_key_of(now())
    union
    select distinct user_token from agent_sessions
    where user_token is not null and started_at > now() - interval '7 days'
  ),
  today as (
    select distinct user_token, company_id from checkins where day_key = day_key_of(now())
  ),
  active_companies as (
    select distinct company_id from checkins where day_key between day_key_of(now()) - 6 and day_key_of(now())
    union
    select distinct company_id from agent_sessions where started_at > now() - interval '7 days'
  ),
  comp as (
    select r.company_id,
           count(distinct r.user_token) as roster_n,
           count(distinct t.user_token) as out_n
    from (select distinct user_token, company_id from checkins
          where day_key between day_key_of(now()) - 6 and day_key_of(now())) r
    left join today t on t.user_token = r.user_token and t.company_id = r.company_id
    group by r.company_id
  )
  select json_build_object(
    'checked_out', (select count(distinct user_token) from today),
    'still_working', greatest(
      (select count(*) from roster) - (select count(distinct user_token) from today), 0),
    'companies_all_out', (select count(*) from comp where roster_n > 0 and out_n >= roster_n),
    'companies_total', (select count(*) from active_companies)
  )
$$;

create or replace function fn_company_pulse(p_company uuid)
returns json language sql stable as $$
  with roster as (
    select distinct user_token from checkins
    where company_id = p_company
      and day_key between day_key_of(now()) - 6 and day_key_of(now())
    union
    select distinct user_token from agent_sessions
    where company_id = p_company and user_token is not null
      and started_at > now() - interval '7 days'
  ),
  today as (
    select distinct user_token from checkins
    where company_id = p_company and day_key = day_key_of(now())
  )
  select json_build_object(
    'checked_out', (select count(*) from today),
    'roster', greatest((select count(*) from roster), (select count(*) from today)),
    'working', (select count(*) from agent_sessions_effective where company_id = p_company and is_working),
    'idle', (select count(*) from agent_sessions_effective where company_id = p_company and is_live and not is_working),
    'active_hours_today', (select round(coalesce(sum(active_seconds), 0) / 3600.0, 1)
       from agent_sessions_effective where company_id = p_company and day_key = day_key_of(now()))
  )
$$;

-- ========== demo ==========
set local search_path = demo, public;

-- 修分母:在册 = 打过卡 或 有 agent 会话 的身份(此前只算打过卡的,新用户装了考勤没打卡就被分母漏掉)
create or replace function fn_pulse()
returns json language sql stable as $$
  with roster as (
    select distinct user_token from checkins
    where day_key between day_key_of(now()) - 6 and day_key_of(now())
    union
    select distinct user_token from agent_sessions
    where user_token is not null and started_at > now() - interval '7 days'
  ),
  today as (
    select distinct user_token, company_id from checkins where day_key = day_key_of(now())
  ),
  active_companies as (
    select distinct company_id from checkins where day_key between day_key_of(now()) - 6 and day_key_of(now())
    union
    select distinct company_id from agent_sessions where started_at > now() - interval '7 days'
  ),
  comp as (
    select r.company_id,
           count(distinct r.user_token) as roster_n,
           count(distinct t.user_token) as out_n
    from (select distinct user_token, company_id from checkins
          where day_key between day_key_of(now()) - 6 and day_key_of(now())) r
    left join today t on t.user_token = r.user_token and t.company_id = r.company_id
    group by r.company_id
  )
  select json_build_object(
    'checked_out', (select count(distinct user_token) from today),
    'still_working', greatest(
      (select count(*) from roster) - (select count(distinct user_token) from today), 0),
    'companies_all_out', (select count(*) from comp where roster_n > 0 and out_n >= roster_n),
    'companies_total', (select count(*) from active_companies)
  )
$$;

create or replace function fn_company_pulse(p_company uuid)
returns json language sql stable as $$
  with roster as (
    select distinct user_token from checkins
    where company_id = p_company
      and day_key between day_key_of(now()) - 6 and day_key_of(now())
    union
    select distinct user_token from agent_sessions
    where company_id = p_company and user_token is not null
      and started_at > now() - interval '7 days'
  ),
  today as (
    select distinct user_token from checkins
    where company_id = p_company and day_key = day_key_of(now())
  )
  select json_build_object(
    'checked_out', (select count(*) from today),
    'roster', greatest((select count(*) from roster), (select count(*) from today)),
    'working', (select count(*) from agent_sessions_effective where company_id = p_company and is_working),
    'idle', (select count(*) from agent_sessions_effective where company_id = p_company and is_live and not is_working),
    'active_hours_today', (select round(coalesce(sum(active_seconds), 0) / 3600.0, 1)
       from agent_sessions_effective where company_id = p_company and day_key = day_key_of(now()))
  )
$$;

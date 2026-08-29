-- pulse 分子改用有效卡口径,与榜单一致

-- ========== public ==========
set local search_path = public;

-- 「已下班」以有效卡为准(checkins_valid ≥12:00),与榜单同口径;中午前的试验性打卡不再计入分子
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
    select distinct user_token, company_id from checkins_valid where day_key = day_key_of(now())
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

-- ========== demo ==========
set local search_path = demo, public;

-- 「已下班」以有效卡为准(checkins_valid ≥12:00),与榜单同口径;中午前的试验性打卡不再计入分子
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
    select distinct user_token, company_id from checkins_valid where day_key = day_key_of(now())
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

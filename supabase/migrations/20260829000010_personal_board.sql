-- 个人旗号 + 个人榜:不绑公司也能上榜(绑定门槛拆除第一步)

-- ========== public ==========
set local search_path = public;

alter table profiles add column if not exists handle text;
create unique index if not exists profiles_handle_uniq on profiles (lower(handle)) where handle is not null;

-- 个人榜:按登录身份聚合(只列设置了旗号的人;公司归属与否不影响)
create or replace function fn_personal_board(p_from date, p_to date)
returns json language sql stable as $$
  with agg as (
    select e.user_token,
           sum(e.active_seconds) / 3600.0 as active_hours,
           count(*) filter (where e.day_key = day_key_of(now()) and e.active_seconds > 0) as daa_today,
           count(*) filter (where e.is_live) as live_now,
           count(*) filter (where e.is_working) as working_now
    from agent_sessions_effective e
    where e.day_key between p_from and p_to and e.user_token is not null
    group by e.user_token
  )
  select coalesce(json_agg(json_build_object(
    'handle', p.handle,
    'active_hours', round(agg.active_hours::numeric, 1),
    'daa_today', agg.daa_today,
    'live_now', agg.live_now,
    'working_now', agg.working_now
  ) order by agg.active_hours desc), '[]'::json)
  from agg
  join profiles p on p.user_token = agg.user_token
  where p.handle is not null
$$;

-- ========== demo ==========
set local search_path = demo, public;

alter table profiles add column if not exists handle text;
create unique index if not exists profiles_handle_uniq on profiles (lower(handle)) where handle is not null;

-- 个人榜:按登录身份聚合(只列设置了旗号的人;公司归属与否不影响)
create or replace function fn_personal_board(p_from date, p_to date)
returns json language sql stable as $$
  with agg as (
    select e.user_token,
           sum(e.active_seconds) / 3600.0 as active_hours,
           count(*) filter (where e.day_key = day_key_of(now()) and e.active_seconds > 0) as daa_today,
           count(*) filter (where e.is_live) as live_now,
           count(*) filter (where e.is_working) as working_now
    from agent_sessions_effective e
    where e.day_key between p_from and p_to and e.user_token is not null
    group by e.user_token
  )
  select coalesce(json_agg(json_build_object(
    'handle', p.handle,
    'active_hours', round(agg.active_hours::numeric, 1),
    'daa_today', agg.daa_today,
    'live_now', agg.live_now,
    'working_now', agg.working_now
  ) order by agg.active_hours desc), '[]'::json)
  from agg
  join profiles p on p.user_token = agg.user_token
  where p.handle is not null
$$;

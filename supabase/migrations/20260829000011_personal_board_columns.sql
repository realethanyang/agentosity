-- 个人榜列对齐公司榜(除成员数):DAA/指数/在岗

-- ========== public ==========
set local search_path = public;

-- 个人榜列对齐公司榜:补 人类工时/最近下班/杠杆(个人自己的下班卡)
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
  ),
  human as (
    select user_token,
           sum(greatest((extract(hour from clocked_at at time zone 'Asia/Shanghai') * 60
                       + extract(minute from clocked_at at time zone 'Asia/Shanghai')) - 540, 60) / 60.0) as human_hours
    from checkins_valid
    where day_key between p_from and p_to
    group by user_token
  ),
  human_day as (
    select distinct on (user_token) user_token,
           round(extract(hour from clocked_at at time zone 'Asia/Shanghai') * 60
               + extract(minute from clocked_at at time zone 'Asia/Shanghai')) as avg_minutes
    from checkins_valid
    where day_key <= p_to
    order by user_token, day_key desc
  )
  select coalesce(json_agg(json_build_object(
    'handle', p.handle,
    'active_hours', round(agg.active_hours::numeric, 1),
    'daa_today', agg.daa_today,
    'human_avg_minutes', human_day.avg_minutes,
    'leverage', case when coalesce(human.human_hours, 0) > 0
                     then round((agg.active_hours / human.human_hours)::numeric, 2) end,
    'live_now', agg.live_now,
    'working_now', agg.working_now
  ) order by agg.active_hours desc), '[]'::json)
  from agg
  join profiles p on p.user_token = agg.user_token
  left join human on human.user_token = agg.user_token
  left join human_day on human_day.user_token = agg.user_token
  where p.handle is not null
$$;

-- ========== demo ==========
set local search_path = demo, public;

-- 个人榜列对齐公司榜:补 人类工时/最近下班/杠杆(个人自己的下班卡)
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
  ),
  human as (
    select user_token,
           sum(greatest((extract(hour from clocked_at at time zone 'Asia/Shanghai') * 60
                       + extract(minute from clocked_at at time zone 'Asia/Shanghai')) - 540, 60) / 60.0) as human_hours
    from checkins_valid
    where day_key between p_from and p_to
    group by user_token
  ),
  human_day as (
    select distinct on (user_token) user_token,
           round(extract(hour from clocked_at at time zone 'Asia/Shanghai') * 60
               + extract(minute from clocked_at at time zone 'Asia/Shanghai')) as avg_minutes
    from checkins_valid
    where day_key <= p_to
    order by user_token, day_key desc
  )
  select coalesce(json_agg(json_build_object(
    'handle', p.handle,
    'active_hours', round(agg.active_hours::numeric, 1),
    'daa_today', agg.daa_today,
    'human_avg_minutes', human_day.avg_minutes,
    'leverage', case when coalesce(human.human_hours, 0) > 0
                     then round((agg.active_hours / human.human_hours)::numeric, 2) end,
    'live_now', agg.live_now,
    'working_now', agg.working_now
  ) order by agg.active_hours desc), '[]'::json)
  from agg
  join profiles p on p.user_token = agg.user_token
  left join human on human.user_token = agg.user_token
  left join human_day on human_day.user_token = agg.user_token
  where p.handle is not null
$$;

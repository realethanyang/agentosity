-- Agent 榜加「人类平均下班」列(灵魂落点:同一行里 人走 18:05 / agent 干到 23:40)

-- ========== public ==========
set local search_path = public;

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
    select h.company_id,
           sum(h.checkin_count * greatest(h.avg_minutes - 540, 60) / 60.0) as human_hours
    from company_daily_human h
    where h.day_key between p_from and p_to
    group by h.company_id
  ),
  human_day as (
    select h.company_id, round(h.avg_minutes) as avg_minutes
    from company_daily_human h where h.day_key = p_to
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
    'human_avg_minutes', human_day.avg_minutes,
    'leverage', case when coalesce(human.human_hours, 0) > 0
                     then round((agg.active_hours / human.human_hours)::numeric, 2) end,
    'live_now', coalesce(live.n, 0)
  ) order by agg.active_hours desc), '[]'::json)
  from agg
  join companies c on c.id = agg.company_id
  left join human on human.company_id = agg.company_id
  left join human_day on human_day.company_id = agg.company_id
  left join live on live.company_id = agg.company_id
$$;

-- ========== demo ==========
set local search_path = demo, public;

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
    select h.company_id,
           sum(h.checkin_count * greatest(h.avg_minutes - 540, 60) / 60.0) as human_hours
    from company_daily_human h
    where h.day_key between p_from and p_to
    group by h.company_id
  ),
  human_day as (
    select h.company_id, round(h.avg_minutes) as avg_minutes
    from company_daily_human h where h.day_key = p_to
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
    'human_avg_minutes', human_day.avg_minutes,
    'leverage', case when coalesce(human.human_hours, 0) > 0
                     then round((agg.active_hours / human.human_hours)::numeric, 2) end,
    'live_now', coalesce(live.n, 0)
  ) order by agg.active_hours desc), '[]'::json)
  from agg
  join companies c on c.id = agg.company_id
  left join human on human.company_id = agg.company_id
  left join human_day on human_day.company_id = agg.company_id
  left join live on live.company_id = agg.company_id
$$;

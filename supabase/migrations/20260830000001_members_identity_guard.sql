-- 成员/在册口径护栏(仅 public):会话侧只认登录身份(user: 前缀),
-- 裸设备 token(凭证降级产生的影子身份)不计入成员数;其工时仍归公司。
set local search_path = public;

create or replace function fn_pulse()
returns json language sql stable as $$
  with roster as (
    select distinct user_token from checkins
    where day_key between day_key_of(now()) - 6 and day_key_of(now())
    union
    select distinct user_token from agent_sessions
    where user_token like 'user:%' and started_at > now() - interval '7 days'
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

create or replace function fn_company_pulse(p_company uuid)
returns json language sql stable as $$
  with roster as (
    select distinct user_token from checkins
    where company_id = p_company
      and day_key between day_key_of(now()) - 6 and day_key_of(now())
    union
    select distinct user_token from agent_sessions
    where company_id = p_company and user_token like 'user:%'
      and started_at > now() - interval '7 days'
  ),
  today as (
    select distinct user_token from checkins_valid
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

-- fn_agents_board(public):members 只认登录身份
set local search_path = public;

set local search_path = public;

-- DAA(今日):当天真实干过活的会话数(active_seconds>0),业界 Daily Active Agents 口径
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
  daa_today as (
    select e.company_id, count(*) as n
    from agent_sessions_effective e
    where e.day_key = day_key_of(now()) and e.active_seconds > 0
    group by e.company_id
  ),
  human as (
    select h.company_id,
           sum(h.checkin_count * greatest(h.avg_minutes - 540, 60) / 60.0) as human_hours
    from company_daily_human h
    where h.day_key between p_from and p_to
    group by h.company_id
  ),
  human_day as (
    select distinct on (h.company_id) h.company_id, round(h.avg_minutes) as avg_minutes
    from company_daily_human h
    where h.day_key <= p_to
    order by h.company_id, h.day_key desc
  ),
  members as (
    select u.company_id, count(distinct u.user_token) as n from (
      select company_id, user_token from checkins
      where day_key between day_key_of(now()) - 6 and day_key_of(now())
      union
      select company_id, user_token from agent_sessions
      where user_token like 'user:%' and started_at > now() - interval '7 days'
    ) u where u.company_id is not null group by u.company_id
  ),
  live as (
    select e.company_id,
           count(*) as n,
           count(*) filter (where e.is_working) as w
    from agent_sessions_effective e where e.is_live group by e.company_id
  )
  select coalesce(json_agg(json_build_object(
    'name', c.name,
    'active_hours', round(agg.active_hours::numeric, 1),
    'session_hours', round(agg.session_hours::numeric, 1),
    'overtime_hours', round(agg.overtime_hours::numeric, 1),
    'sessions', agg.sessions,
    'daa_today', coalesce(daa_today.n, 0),
    'human_hours', round(coalesce(human.human_hours, 0)::numeric, 1),
    'human_avg_minutes', human_day.avg_minutes,
    'leverage', case when coalesce(human.human_hours, 0) > 0
                     then round((agg.active_hours / human.human_hours)::numeric, 2) end,
    'members', coalesce(members.n, 0),
    'live_now', coalesce(live.n, 0),
    'working_now', coalesce(live.w, 0)
  ) order by agg.active_hours desc), '[]'::json)
  from agg
  join companies c on c.id = agg.company_id
  left join daa_today on daa_today.company_id = agg.company_id
  left join human on human.company_id = agg.company_id
  left join human_day on human_day.company_id = agg.company_id
  left join members on members.company_id = agg.company_id
  left join live on live.company_id = agg.company_id
$$;


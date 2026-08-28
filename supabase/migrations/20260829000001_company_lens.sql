-- 三环仪表盘数据层:公司脉搏 + 公司社会坐标

-- ========== public ==========
set local search_path = public;

-- 公司实时脉搏:本公司今天谁下班了 + 本公司 agent 干活/挂机
create or replace function fn_company_pulse(p_company uuid)
returns json language sql stable as $$
  with roster as (
    select distinct user_token from checkins
    where company_id = p_company
      and day_key between day_key_of(now()) - 6 and day_key_of(now())
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

-- 公司的社会坐标:Agent 榜名次(全国 + 每个行业/城市标签)+ 早下班榜名次(全国)
create or replace function fn_company_ranks(p_company uuid, p_from date, p_to date, p_day date)
returns json language sql stable as $$
  with me as (select industry_tags, city_tags from companies where id = p_company),
  agg as (
    select a.company_id, sum(a.active_hours) as ah
    from company_daily_agents a
    where a.day_key between p_from and p_to
    group by a.company_id
  ),
  agent_all as (
    select company_id, rank() over (order by ah desc) as rn, count(*) over () as total from agg
  ),
  human as (
    select h.company_id, h.avg_minutes, h.checkin_count
    from company_daily_human h where h.day_key = p_day
  ),
  human_all as (
    select company_id, rank() over (order by avg_minutes asc, checkin_count desc) as rn,
           count(*) over () as total
    from human
  )
  select json_build_object(
    'agent_overall', (select json_build_object('rank', rn, 'total', total) from agent_all where company_id = p_company),
    'agent_by_industry', coalesce((
      select json_agg(json_build_object('tag', t, 'rank', r.rn, 'total', r.total))
      from unnest((select industry_tags from me)) t,
      lateral (
        select x.rn, x.total from (
          select agg.company_id, rank() over (order by agg.ah desc) as rn, count(*) over () as total
          from agg join companies c on c.id = agg.company_id
          where t = any(c.industry_tags)
        ) x where x.company_id = p_company
      ) r), '[]'::json),
    'agent_by_city', coalesce((
      select json_agg(json_build_object('tag', t, 'rank', r.rn, 'total', r.total))
      from unnest((select city_tags from me)) t,
      lateral (
        select x.rn, x.total from (
          select agg.company_id, rank() over (order by agg.ah desc) as rn, count(*) over () as total
          from agg join companies c on c.id = agg.company_id
          where t = any(c.city_tags)
        ) x where x.company_id = p_company
      ) r), '[]'::json),
    'human_overall', (select json_build_object('rank', rn, 'total', total) from human_all where company_id = p_company)
  )
$$;

-- ========== demo ==========
set local search_path = demo, public;

-- 公司实时脉搏:本公司今天谁下班了 + 本公司 agent 干活/挂机
create or replace function fn_company_pulse(p_company uuid)
returns json language sql stable as $$
  with roster as (
    select distinct user_token from checkins
    where company_id = p_company
      and day_key between day_key_of(now()) - 6 and day_key_of(now())
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

-- 公司的社会坐标:Agent 榜名次(全国 + 每个行业/城市标签)+ 早下班榜名次(全国)
create or replace function fn_company_ranks(p_company uuid, p_from date, p_to date, p_day date)
returns json language sql stable as $$
  with me as (select industry_tags, city_tags from companies where id = p_company),
  agg as (
    select a.company_id, sum(a.active_hours) as ah
    from company_daily_agents a
    where a.day_key between p_from and p_to
    group by a.company_id
  ),
  agent_all as (
    select company_id, rank() over (order by ah desc) as rn, count(*) over () as total from agg
  ),
  human as (
    select h.company_id, h.avg_minutes, h.checkin_count
    from company_daily_human h where h.day_key = p_day
  ),
  human_all as (
    select company_id, rank() over (order by avg_minutes asc, checkin_count desc) as rn,
           count(*) over () as total
    from human
  )
  select json_build_object(
    'agent_overall', (select json_build_object('rank', rn, 'total', total) from agent_all where company_id = p_company),
    'agent_by_industry', coalesce((
      select json_agg(json_build_object('tag', t, 'rank', r.rn, 'total', r.total))
      from unnest((select industry_tags from me)) t,
      lateral (
        select x.rn, x.total from (
          select agg.company_id, rank() over (order by agg.ah desc) as rn, count(*) over () as total
          from agg join companies c on c.id = agg.company_id
          where t = any(c.industry_tags)
        ) x where x.company_id = p_company
      ) r), '[]'::json),
    'agent_by_city', coalesce((
      select json_agg(json_build_object('tag', t, 'rank', r.rn, 'total', r.total))
      from unnest((select city_tags from me)) t,
      lateral (
        select x.rn, x.total from (
          select agg.company_id, rank() over (order by agg.ah desc) as rn, count(*) over () as total
          from agg join companies c on c.id = agg.company_id
          where t = any(c.city_tags)
        ) x where x.company_id = p_company
      ) r), '[]'::json),
    'human_overall', (select json_build_object('rank', rn, 'total', total) from human_all where company_id = p_company)
  )
$$;

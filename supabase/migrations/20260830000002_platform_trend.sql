-- 全站增长趋势

-- ========== public ==========
set local search_path = public;

-- 全站逐日 agent-hours 趋势 + 历史累计(增长的门面)
create or replace function fn_platform_trend(p_days int default 14)
returns json language sql stable as $$
  with days as (
    select day_key, sum(active_hours) as hours
    from company_daily_agents
    where day_key > day_key_of(now()) - p_days
    group by day_key
  )
  select json_build_object(
    'trend', coalesce((select json_agg(json_build_object(
        'day', day_key, 'hours', round(hours::numeric, 1)) order by day_key) from days), '[]'::json),
    'total_hours', (select round(coalesce(sum(active_hours), 0)::numeric, 1) from company_daily_agents)
  )
$$;

-- ========== demo ==========
set local search_path = demo, public;

-- 全站逐日 agent-hours 趋势 + 历史累计(增长的门面)
create or replace function fn_platform_trend(p_days int default 14)
returns json language sql stable as $$
  with days as (
    select day_key, sum(active_hours) as hours
    from company_daily_agents
    where day_key > day_key_of(now()) - p_days
    group by day_key
  )
  select json_build_object(
    'trend', coalesce((select json_agg(json_build_object(
        'day', day_key, 'hours', round(hours::numeric, 1)) order by day_key) from days), '[]'::json),
    'total_hours', (select round(coalesce(sum(active_hours), 0)::numeric, 1) from company_daily_agents)
  )
$$;

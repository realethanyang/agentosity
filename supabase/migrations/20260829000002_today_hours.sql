-- 全网实况补充:今日累计 active agent-hours

-- ========== public ==========
set local search_path = public;

create or replace function fn_live_agents()
returns json language sql stable as $$
  select json_build_object(
    'total', (select count(*) from agent_sessions_effective where is_live),
    'working', (select count(*) from agent_sessions_effective where is_working),
    'idle', (select count(*) from agent_sessions_effective where is_live and not is_working),
    'today_active_hours', (select round(coalesce(sum(active_seconds), 0) / 3600.0, 1)
       from agent_sessions_effective where day_key = day_key_of(now())),
    'by_company', coalesce((
      select json_agg(json_build_object('name', c.name, 'harness', e.harness,
        'working', e.is_working,
        'since_minutes', round(extract(epoch from (now() - e.started_at)) / 60)) order by e.started_at)
      from agent_sessions_effective e join companies c on c.id = e.company_id
      where e.is_live), '[]'::json)
  )
$$;

-- ========== demo ==========
set local search_path = demo, public;

create or replace function fn_live_agents()
returns json language sql stable as $$
  select json_build_object(
    'total', (select count(*) from agent_sessions_effective where is_live),
    'working', (select count(*) from agent_sessions_effective where is_working),
    'idle', (select count(*) from agent_sessions_effective where is_live and not is_working),
    'today_active_hours', (select round(coalesce(sum(active_seconds), 0) / 3600.0, 1)
       from agent_sessions_effective where day_key = day_key_of(now())),
    'by_company', coalesce((
      select json_agg(json_build_object('name', c.name, 'harness', e.harness,
        'working', e.is_working,
        'since_minutes', round(extract(epoch from (now() - e.started_at)) / 60)) order by e.started_at)
      from agent_sessions_effective e join companies c on c.id = e.company_id
      where e.is_live), '[]'::json)
  )
$$;

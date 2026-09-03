-- Vercel 减流:心跳批量化 + 在线窗口放宽(视图重建)

-- ========== public ==========
set local search_path = public;

-- 表在建视图后加过列(active_offset),s.* 展开变化 → 必须 drop 后重建(含依赖视图)
drop view if exists company_daily_agents;
drop view if exists agent_sessions_effective;

-- 放宽在线判定窗口(心跳降频到 180s 后,3 分钟窗口会误判掉线):live 10min / working 6min
create view agent_sessions_effective as
select
  s.*,
  coalesce(s.ended_at, s.last_heartbeat_at) as effective_end,
  greatest(extract(epoch from (coalesce(s.ended_at, s.last_heartbeat_at) - s.started_at)), 0) as session_seconds,
  (s.ended_at is null and s.last_heartbeat_at > now() - interval '10 minutes') as is_live,
  (s.ended_at is null and s.last_heartbeat_at > now() - interval '10 minutes'
    and s.last_active_at is not null and s.last_active_at > now() - interval '6 minutes') as is_working,
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

-- 批量心跳:雷达一台机器几百条会话,从"每条一请求"改为"每轮一请求"
create or replace function fn_heartbeats(p_beats jsonb)
returns void language plpgsql as $$
declare b jsonb;
begin
  for b in select * from jsonb_array_elements(coalesce(p_beats, '[]'::jsonb)) loop
    perform fn_heartbeat(
      (b->>'session_id')::uuid,
      nullif(b->>'active_seconds', '')::integer,
      b->>'probe',
      coalesce((b->>'active')::boolean, false)
    );
  end loop;
end $$;

-- ========== demo ==========
set local search_path = demo, public;

-- 表在建视图后加过列(active_offset),s.* 展开变化 → 必须 drop 后重建(含依赖视图)
drop view if exists company_daily_agents;
drop view if exists agent_sessions_effective;

-- 放宽在线判定窗口(心跳降频到 180s 后,3 分钟窗口会误判掉线):live 10min / working 6min
create view agent_sessions_effective as
select
  s.*,
  coalesce(s.ended_at, s.last_heartbeat_at) as effective_end,
  greatest(extract(epoch from (coalesce(s.ended_at, s.last_heartbeat_at) - s.started_at)), 0) as session_seconds,
  (s.ended_at is null and s.last_heartbeat_at > now() - interval '10 minutes') as is_live,
  (s.ended_at is null and s.last_heartbeat_at > now() - interval '10 minutes'
    and s.last_active_at is not null and s.last_active_at > now() - interval '6 minutes') as is_working,
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

-- 批量心跳:雷达一台机器几百条会话,从"每条一请求"改为"每轮一请求"
create or replace function fn_heartbeats(p_beats jsonb)
returns void language plpgsql as $$
declare b jsonb;
begin
  for b in select * from jsonb_array_elements(coalesce(p_beats, '[]'::jsonb)) loop
    perform fn_heartbeat(
      (b->>'session_id')::uuid,
      nullif(b->>'active_seconds', '')::integer,
      b->>'probe',
      coalesce((b->>'active')::boolean, false)
    );
  end loop;
end $$;

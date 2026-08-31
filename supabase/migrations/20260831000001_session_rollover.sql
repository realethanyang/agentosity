-- 跨天长会话滚账:常驻 Agent(LoopHouse 等)不再把今天的活记进昨天

-- ========== public ==========
set local search_path = public;

alter table agent_sessions add column if not exists active_offset integer not null default 0;

-- 心跳(原子):跨天会话先滚账——旧账归档为昨日已结束会话,原会话(id 不变)从今日 5:00 重新起算。
-- 客户端上报的是自会话启动以来的累计活跃秒数,经 active_offset 换算成"今日桶内"的值。
create or replace function fn_heartbeat(p_id uuid, p_active integer, p_probe text, p_is_active boolean)
returns void language plpgsql as $$
declare
  s agent_sessions%rowtype;
  boundary timestamptz;
begin
  select * into s from agent_sessions where id = p_id and ended_at is null for update;
  if not found then return; end if;

  if day_key_of(s.started_at) < day_key_of(now()) then
    boundary := (day_key_of(now())::timestamp + interval '5 hours') at time zone 'Asia/Shanghai';
    insert into agent_sessions
      (company_id, user_token, harness, probe, started_at, last_heartbeat_at, ended_at,
       active_seconds, active_offset, last_active_at, created_at)
    values
      (s.company_id, s.user_token, s.harness, s.probe, s.started_at, boundary, boundary,
       s.active_seconds, 0, s.last_active_at, s.created_at);
    update agent_sessions
      set started_at = boundary,
          active_offset = active_offset + active_seconds,
          active_seconds = 0
      where id = p_id;
    select * into s from agent_sessions where id = p_id;
  end if;

  update agent_sessions set
    last_heartbeat_at = now(),
    probe = coalesce(p_probe, probe),
    last_active_at = case when p_is_active then now() else last_active_at end,
    active_seconds = case when p_active is not null
                          then greatest(0, p_active - active_offset) else active_seconds end
  where id = p_id;
end $$;

-- 会话结束:同样经 offset 换算
create or replace function fn_session_end(p_id uuid, p_active integer)
returns void language plpgsql as $$
begin
  update agent_sessions set
    ended_at = now(),
    active_seconds = case when p_active is not null
                          then greatest(0, p_active - active_offset) else active_seconds end
  where id = p_id and ended_at is null;
end $$;

-- ========== demo ==========
set local search_path = demo, public;

alter table agent_sessions add column if not exists active_offset integer not null default 0;

-- 心跳(原子):跨天会话先滚账——旧账归档为昨日已结束会话,原会话(id 不变)从今日 5:00 重新起算。
-- 客户端上报的是自会话启动以来的累计活跃秒数,经 active_offset 换算成"今日桶内"的值。
create or replace function fn_heartbeat(p_id uuid, p_active integer, p_probe text, p_is_active boolean)
returns void language plpgsql as $$
declare
  s agent_sessions%rowtype;
  boundary timestamptz;
begin
  select * into s from agent_sessions where id = p_id and ended_at is null for update;
  if not found then return; end if;

  if day_key_of(s.started_at) < day_key_of(now()) then
    boundary := (day_key_of(now())::timestamp + interval '5 hours') at time zone 'Asia/Shanghai';
    insert into agent_sessions
      (company_id, user_token, harness, probe, started_at, last_heartbeat_at, ended_at,
       active_seconds, active_offset, last_active_at, created_at)
    values
      (s.company_id, s.user_token, s.harness, s.probe, s.started_at, boundary, boundary,
       s.active_seconds, 0, s.last_active_at, s.created_at);
    update agent_sessions
      set started_at = boundary,
          active_offset = active_offset + active_seconds,
          active_seconds = 0
      where id = p_id;
    select * into s from agent_sessions where id = p_id;
  end if;

  update agent_sessions set
    last_heartbeat_at = now(),
    probe = coalesce(p_probe, probe),
    last_active_at = case when p_is_active then now() else last_active_at end,
    active_seconds = case when p_active is not null
                          then greatest(0, p_active - active_offset) else active_seconds end
  where id = p_id;
end $$;

-- 会话结束:同样经 offset 换算
create or replace function fn_session_end(p_id uuid, p_active integer)
returns void language plpgsql as $$
begin
  update agent_sessions set
    ended_at = now(),
    active_seconds = case when p_active is not null
                          then greatest(0, p_active - active_offset) else active_seconds end
  where id = p_id and ended_at is null;
end $$;

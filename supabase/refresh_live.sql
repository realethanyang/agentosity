-- Demo 前跑一次:刷新"正在上班"的 live agent 会话,让在岗实况有数字
-- 用法:PGPASSWORD=... psql "host=aws-0-ap-southeast-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.phkifnntpacovtwiwhrp sslmode=require" -f supabase/refresh_live.sql

-- 结算掉已经过期的旧 live 会话
update agent_sessions set ended_at = last_heartbeat_at where ended_at is null;

-- 造一批新的 live 会话
do $$
declare
  comp record;
  s_start timestamptz;
  harnesses text[] := array['claude-code', 'codex', 'gemini-cli'];
begin
  for comp in select id from companies where source = 'builtin' order by random() limit 8 loop
    s_start := now() - make_interval(mins => (20 + floor(random() * 180))::int);
    insert into agent_sessions (company_id, harness, probe, started_at, last_heartbeat_at, ended_at, active_seconds)
    values (
      comp.id,
      harnesses[1 + floor(random() * 3)::int],
      'file-mtime',
      s_start,
      now(),
      null,
      (extract(epoch from (now() - s_start)) * 0.7)::int
    );
  end loop;
end $$;

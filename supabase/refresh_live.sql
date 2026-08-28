-- Demo 前跑一次:刷新"正在上班"的 live agent 会话,让在岗实况有数字
-- 用法:PGPASSWORD=... psql "host=aws-0-ap-southeast-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.phkifnntpacovtwiwhrp sslmode=require" -f supabase/refresh_live.sql

-- 结算掉已经过期的旧 live 会话
update agent_sessions set ended_at = last_heartbeat_at where ended_at is null;

-- 造"今天的下班潮":从近 7 天在册用户里抽一批,今天 17:30 之后陆续打卡(让实时脉搏有数)
insert into checkins (company_id, user_token, clocked_at, day_key)
select company_id, user_token,
       (day_key_of(now())::timestamp + make_interval(mins => (1050 + floor(random() * 240))::int)) at time zone 'Asia/Shanghai',
       day_key_of(now())
from (
  select distinct company_id, user_token from checkins
  where day_key between day_key_of(now()) - 6 and day_key_of(now()) - 1
) roster
where random() < 0.45
on conflict (user_token, day_key) do nothing;
-- 未来时间的打卡回拨到现在之前(不能"预打卡")
update checkins set clocked_at = now() - make_interval(mins => floor(random() * 90)::int)
where day_key = day_key_of(now()) and clocked_at > now();

-- 造一批新的 live 会话
do $$
declare
  comp record;
  s_start timestamptz;
  harnesses text[] := array['claude-code', 'codex', 'gemini-cli'];
begin
  for comp in select id from companies where source = 'builtin' order by random() limit 8 loop
    s_start := now() - make_interval(mins => (20 + floor(random() * 180))::int);
    insert into agent_sessions (company_id, harness, probe, started_at, last_heartbeat_at, ended_at, active_seconds, last_active_at)
    values (
      comp.id,
      harnesses[1 + floor(random() * 3)::int],
      'file-mtime',
      s_start,
      now(),
      null,
      (extract(epoch from (now() - s_start)) * 0.7)::int,
      -- 约 6 成在干活(刚刚有活跃),其余挂机 idle
      case when random() < 0.6 then now() - make_interval(secs => floor(random() * 60)::int)
           else now() - interval '15 minutes' end
    );
  end loop;
end $$;

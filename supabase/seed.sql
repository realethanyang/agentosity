-- Demo seed:模拟公司 + 近两周打卡 + agent 会话
-- 叙事设定:越 AI-native 的公司(agent 越多),人走得越早
-- 注意:正式上线前需清空本 seed 数据

select setseed(0.42);

insert into companies (name, industry_tags, city_tags, source) values
  ('字节跳动', '{互联网,内容}', '{北京,上海,深圳}', 'builtin'),
  ('腾讯', '{互联网,游戏}', '{深圳,北京}', 'builtin'),
  ('阿里巴巴', '{互联网,电商}', '{杭州,北京}', 'builtin'),
  ('米哈游', '{游戏}', '{上海}', 'builtin'),
  ('网易', '{互联网,游戏}', '{杭州,广州}', 'builtin'),
  ('美团', '{互联网,本地生活}', '{北京}', 'builtin'),
  ('快手', '{互联网,内容}', '{北京}', 'builtin'),
  ('百度', '{互联网,AI}', '{北京}', 'builtin'),
  ('京东', '{电商}', '{北京}', 'builtin'),
  ('华为', '{硬件,通信}', '{深圳,东莞}', 'builtin'),
  ('小米', '{硬件,汽车}', '{北京,武汉}', 'builtin'),
  ('蔚来', '{汽车}', '{上海,合肥}', 'builtin'),
  ('理想汽车', '{汽车}', '{北京}', 'builtin'),
  ('大疆', '{硬件}', '{深圳}', 'builtin'),
  ('携程', '{互联网,旅行}', '{上海}', 'builtin'),
  ('哔哩哔哩', '{互联网,内容}', '{上海}', 'builtin'),
  ('小红书', '{互联网,内容}', '{上海}', 'builtin'),
  ('拼多多', '{电商}', '{上海}', 'builtin'),
  ('知乎', '{互联网,内容}', '{北京}', 'builtin'),
  ('泡泡玛特', '{消费}', '{北京}', 'builtin'),
  ('元气森林', '{消费}', '{北京}', 'builtin'),
  ('完美世界', '{游戏}', '{北京}', 'builtin'),
  ('莉莉丝游戏', '{游戏}', '{上海}', 'builtin'),
  ('叠纸游戏', '{游戏}', '{上海}', 'builtin'),
  ('心动网络', '{游戏}', '{上海}', 'builtin'),
  ('月之暗面', '{AI}', '{北京}', 'builtin'),
  ('智谱AI', '{AI}', '{北京}', 'builtin'),
  ('深度求索', '{AI}', '{杭州}', 'builtin'),
  ('MiniMax', '{AI}', '{上海}', 'builtin'),
  ('阶跃星辰', '{AI}', '{上海}', 'builtin'),
  ('宇树科技', '{硬件,机器人}', '{杭州}', 'builtin'),
  ('影石Insta360', '{硬件}', '{深圳}', 'builtin'),
  ('得物', '{电商}', '{上海}', 'builtin'),
  ('货拉拉', '{互联网,物流}', '{深圳}', 'builtin'),
  ('Keep', '{互联网,健康}', '{北京}', 'builtin'),
  ('作业帮', '{教育}', '{北京}', 'builtin')
on conflict (name) do nothing;

do $$
declare
  comp record;
  d date;
  base_minutes int;
  ai_factor numeric;   -- 0~1,越高越 AI-native:人早走、agent 多
  n_emp int;
  i int;
  m numeric;
  clocked timestamptz;
  agent_n int;
  s_start timestamptz;
  dur_min numeric;
  act_ratio numeric;
  harnesses text[] := array['claude-code', 'codex', 'gemini-cli'];
begin
  for comp in select id, name from companies where source = 'builtin' loop
    ai_factor := random();
    -- AI-native 度越高,平均下班越早:17:35(1055)~ 21:55(1315)
    base_minutes := 1315 - floor(ai_factor * 260)::int;
    n_emp := 3 + floor(random() * 12)::int;

    for d in select gs::date from generate_series(current_date - 13, current_date - 1, interval '1 day') gs loop
      continue when extract(isodow from d) > 5;

      -- 人类打卡
      for i in 1..n_emp loop
        continue when random() < 0.25;  -- 不是每人每天都打
        m := base_minutes + (random() - 0.5) * 100;
        clocked := (d::timestamp + make_interval(mins => greatest(m, 740)::int)) at time zone 'Asia/Shanghai';
        insert into checkins (company_id, user_token, clocked_at, day_key)
        values (comp.id, 'seed-' || comp.id || '-' || i, clocked, d)
        on conflict do nothing;
      end loop;

      -- Agent 会话:数量与 AI-native 度挂钩
      agent_n := floor(ai_factor * 7 * random())::int;
      for i in 1..agent_n loop
        -- 10:00 ~ 23:00 之间开工,部分在人类下班后仍在跑(Agent Overtime)
        s_start := (d::timestamp + make_interval(mins => (600 + floor(random() * 780))::int)) at time zone 'Asia/Shanghai';
        dur_min := 20 + random() * 300;
        act_ratio := 0.4 + random() * 0.5;
        insert into agent_sessions (company_id, harness, probe, started_at, last_heartbeat_at, ended_at, active_seconds)
        values (
          comp.id,
          harnesses[1 + floor(random() * 3)::int],
          'file-mtime',
          s_start,
          s_start + make_interval(mins => dur_min::int),
          s_start + make_interval(mins => dur_min::int),
          (dur_min * 60 * act_ratio)::int
        );
      end loop;
    end loop;
  end loop;

  -- 若干"正在上班"的 live agent(demo 前重跑本 seed 可刷新)
  for comp in select id from companies where source = 'builtin' order by random() limit 6 loop
    s_start := now() - make_interval(mins => (30 + floor(random() * 150))::int);
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

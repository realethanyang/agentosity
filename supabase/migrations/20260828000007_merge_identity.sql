-- 身份合并:设备匿名记录并入账号。同日冲突保留更晚的打卡(与"以最后一次为准"一致)。
-- public 与 demo 各一份(demo 站 /login 也会调用)。

set local search_path = public;

create or replace function fn_merge_identity(p_device text, p_user text)
returns void language sql volatile as $$
  update agent_sessions set user_token = p_user where user_token = p_device;

  -- 无冲突的日子直接改归属
  update checkins d set user_token = p_user
  where d.user_token = p_device
    and not exists (select 1 from checkins u where u.user_token = p_user and u.day_key = d.day_key);

  -- 冲突的日子:设备侧更晚则覆盖账号行
  update checkins u
  set clocked_at = d.clocked_at, company_id = d.company_id, backfill = d.backfill
  from checkins d
  where u.user_token = p_user and d.user_token = p_device
    and d.day_key = u.day_key and d.clocked_at > u.clocked_at;

  delete from checkins where user_token = p_device;
$$;

set local search_path = demo, public;

create or replace function fn_merge_identity(p_device text, p_user text)
returns void language sql volatile as $$
  update agent_sessions set user_token = p_user where user_token = p_device;

  update checkins d set user_token = p_user
  where d.user_token = p_device
    and not exists (select 1 from checkins u where u.user_token = p_user and u.day_key = d.day_key);

  update checkins u
  set clocked_at = d.clocked_at, company_id = d.company_id, backfill = d.backfill
  from checkins d
  where u.user_token = p_user and d.user_token = p_device
    and d.day_key = u.day_key and d.clocked_at > u.clocked_at;

  delete from checkins where user_token = p_device;
$$;

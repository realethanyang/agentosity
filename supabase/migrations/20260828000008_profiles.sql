-- 公司绑定服务端化:profiles = 身份(账号/设备)→ 公司 的唯一真相
-- 改绑限频(每周一次)在 API 层用 company_changed_at 判定;首绑免费

set local search_path = public;

create table profiles (
  user_token text primary key,
  company_id uuid references companies(id) on delete set null,
  company_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

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

  -- 公司绑定:账号没有绑定时继承设备的
  insert into profiles (user_token, company_id, company_changed_at)
  select p_user, company_id, company_changed_at from profiles where user_token = p_device
  on conflict (user_token) do nothing;
  delete from profiles where user_token = p_device;
$$;

set local search_path = demo, public;

create table profiles (
  user_token text primary key,
  company_id uuid references companies(id) on delete set null,
  company_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table profiles enable row level security;

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

  insert into profiles (user_token, company_id, company_changed_at)
  select p_user, company_id, company_changed_at from profiles where user_token = p_device
  on conflict (user_token) do nothing;
  delete from profiles where user_token = p_device;
$$;

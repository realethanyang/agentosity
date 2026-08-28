-- 设备授权流:menu bar app 在浏览器完成登录
-- 流程:app 生成 code → 打开 /login?device=code → 网页登录后 approve 写入 token → app 轮询取走即删
create table public.device_codes (
  code text primary key,
  access_token text,
  email text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);
alter table public.device_codes enable row level security;

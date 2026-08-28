-- 设备授权流:补 refresh_token(access token 1 小时过期,客户端需要续期)
alter table public.device_codes add column if not exists refresh_token text;

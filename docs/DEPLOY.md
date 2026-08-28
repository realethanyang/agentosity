# 部署手册

## 双站架构(正式 / demo)

同一套代码、同一个 Supabase,两个 Postgres schema 两个 Vercel 项目:

| 站点 | Vercel 项目 | 数据 schema | 数据 |
|---|---|---|---|
| agentosity.com | `agentosity` | `public`(DATA_SCHEMA 未设) | 真实用户,干净 |
| demo.agentosity.com | `agentosity-demo` | `demo`(env DATA_SCHEMA=demo) | seed 模拟数据 |

发布方式(CLI 在 apps/web 目录,用 link 切换项目):

```bash
cd apps/web
vercel link --yes --project agentosity --scope realethanyanggmailcoms-projects && vercel deploy --prod --yes
vercel link --yes --project agentosity-demo --scope realethanyanggmailcoms-projects && vercel deploy --prod --yes
```

demo 数据刷新(注意 search_path 指向 demo):

```bash
PGPASSWORD=$DB_PASS PGOPTIONS="-c search_path=demo,public" psql \
  "host=aws-0-ap-southeast-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.phkifnntpacovtwiwhrp sslmode=require" \
  -f supabase/refresh_live.sql
```

## Vercel(apps/web)

1. vercel.com 用 GitHub(realethanyang)登录 → **Add New… → Project** → Import `realethanyang/agentosity`
2. **Root Directory 选 `apps/web`**(monorepo 关键一步),Framework 自动识别 Next.js
3. 环境变量(Production + Preview 都加):
   - `SUPABASE_URL` = `https://phkifnntpacovtwiwhrp.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY` = (本地 `apps/web/.env.local` 里那串,或 Supabase Dashboard → Settings → API)
4. Deploy。之后每次 push main 自动发布。

## 域名(Cloudflare → Vercel)

1. Vercel 项目 → Settings → Domains → 添加 `agentosity.com` 和 `www.agentosity.com`
2. 按 Vercel 提示在 Cloudflare DNS 加记录(A `76.76.21.21` / CNAME `cname.vercel-dns.com`),
   Cloudflare 代理状态建议先设 **DNS only**(灰云),避免和 Vercel 证书打架
3. 生效后,把 `packages/cli/src/config.js` 与 menubar 默认 API 地址确认为 `https://agentosity.com`(已是默认)

## npm 发布(packages/cli)

```bash
npm login          # 需要账号
cd packages/cli
npm publish        # 包名 agentosity,0.1.0(2026-08-28 查名字空闲)
```

## 邮件(P2 登录用)

Supabase 自带 SMTP 免费档限流极狠(每小时个位数),正式启用登录前:
1. resend.com 注册,拿 API key,验证 agentosity.com 发件域名(加 DNS 记录)
2. Supabase Dashboard → Auth → SMTP Settings 填 Resend SMTP

## 登录门禁(统一登录)

- 正式站 Vercel 项目 `agentosity` 设了 `REQUIRE_LOGIN=1` + `NEXT_PUBLIC_REQUIRE_LOGIN=1`(打卡/绑公司匿名 401);
- demo 项目**不设**这两个变量 → 现场扫码零门槛。

## mac App 分发

- GitHub Release:`gh release upload v0.2.0 apps/menubar/dist/Agentosity.app.zip --clobber`(先 `apps/menubar/build-app.sh` + `ditto -c -k --keepParent`);
- 已用 Developer ID(Ethan Yang, UTR5A48B54)签名 + 硬化运行时;**公证待办**:拿到 Apple ID App 专用密码后 `xcrun notarytool submit ... --apple-id ... --team-id UTR5A48B54 --password <app专用密码> --wait` + `xcrun stapler staple`。

## Demo 前 checklist

- 跑一次 live 数据刷新:
  `PGPASSWORD=$DB_PASS psql "host=aws-0-ap-southeast-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.phkifnntpacovtwiwhrp sslmode=require" -f supabase/refresh_live.sql`
  (DB 密码在本地 `.env.local.secrets`,不在 git 里)
- menu bar app:`apps/menubar/build-app.sh` 后打开 `dist/Agentosity.app`
- 现场真人扫码打卡:手机开 `https://agentosity.com/checkin`
- 现场 Agent 演示:任意项目 `npx agentosity init <公司名>` 后开一个 Claude Code 会话,
  /agents 页 30 秒内出现在岗 +1

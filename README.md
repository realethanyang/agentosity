# Agentosity

> **AI-native is a number now.**
> Humans clock out. Agents clock in.

下班榜 × Agentosity — 全国上班族共同维护的真实下班时间数据库,以及衡量个人/组织 AI-native 程度的标尺。

人类打卡下班,公司按平均下班时间排名(只公布前三);Agent 的工时由本地探针自动考勤 — 证明「公司越 AI-native,人走得越早」。

## Monorepo 结构

```
apps/web        # Next.js — 官网 / 榜单 / 打卡 / API
packages/cli    # npm 包 `agentosity` — CLI + stdio MCP 考勤 + 活跃度探针
supabase/       # 数据库 migrations + seed
docs/           # 产品与技术方案
```

## 指标体系

- **agent-hours** — 基本单位,对仗 man-hours / GPU-hours
- **Active Agent-Hours** — 活跃工时(探针过滤,榜单主指标)
- **DAA / MAA** — Daily / Monthly Active Agents
- **Agent Overtime** — 人类下班后的 agent-hours
- **Agent Leverage** — agent-hours ÷ human-hours

## 开发

```bash
pnpm install
pnpm dev
```

诞生于 VibeHacks #5(24h,主题「早点下班」)。

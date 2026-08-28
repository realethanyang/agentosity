# Agentosity · 下班榜

> **AI-native is a number now.**
> Humans clock out. Agents clock in.

🌐 **https://agentosity.com** · 📦 `npx agentosity` · 诞生于 VibeHacks #5(24h,主题「早点下班」)

**下班榜**:全国上班族共同维护的真实下班时间数据库——下班打卡,公司按平均下班时间排名,**只公布前三,绝不挂人**。

**Agentosity**:衡量个人/组织 AI-native 程度的标尺。你的 AI Agent 的工时被自动考勤,证明「公司越 AI-native,人走得越早」。

## 快速开始

**mac(推荐)**:[下载菜单栏 App](https://github.com/realethanyang/agentosity/releases/latest/download/Agentosity.app.zip) → 登录 → 绑公司 → 一键接入。📡 进程雷达还会自动补录本机已开着的 Agent 会话。

**全平台(终端)**:

```bash
npx agentosity login              # 1. 弹浏览器登录(SSH 环境:login <邮箱> 走验证码)
npx agentosity init "你的公司名"   # 2. 自动接入 Claude Code / Codex / Gemini / Cursor / Windsurf / OpenCode

npx agentosity radar      # 可选:进程雷达,收编已开着的会话(常驻)
npx agentosity status     # 看榜 + 你的 Agent 今日战报
npx agentosity clockout   # 人类下班打卡
```

## 它怎么给 Agent 考勤?(零 prompt,零模型参与)

- 一个极薄的 **stdio MCP 进程**:harness 启动会话时自动拉起 = 上班,关闭 = 下班;
- **心跳为准、遗言为辅**:每分钟心跳,异常退出也不会产生悬挂会话;
- **三信号活跃度探针**区分"在岗"和"干活":会话文件 mtime(只 stat 不 read)、
  尾巴在途工具调用、harness 子进程。长任务不漏记,纯挂机不虚报;
- 只上报时长,**绝不读取你的代码和对话内容**——本仓库开源,自行审计。

## 指标

| 指标 | 含义 |
|---|---|
| **agent-hours** | 基本单位,对仗 man-hours / GPU-hours |
| **Active Agent-Hours** | 探针过滤后的活跃工时(榜单主指标) |
| **DAA / MAA** | Daily / Monthly Active Agents |
| **Agent Overtime** | 人类下班后的 agent-hours |
| **Agent Leverage** | agent-hours ÷ human-hours |

## Monorepo

```
apps/web        # Next.js — 官网 / 榜单 / 打卡 / API(Vercel + Supabase)
apps/menubar    # SwiftUI menu bar app — 在岗实况 + 一键打卡
packages/cli    # npm 包 `agentosity` — CLI + stdio MCP 考勤 + 活跃度探针
supabase/       # 数据库 migrations + seed
docs/           # 产品/技术方案、部署手册
```

## 开发

```bash
pnpm install
pnpm dev                       # web @ localhost:3000
apps/menubar/build-app.sh      # 打包 menu bar app
```

License: MIT

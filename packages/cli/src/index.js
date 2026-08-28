import { execFileSync } from "node:child_process";
import { loadConfig, saveConfig, apiBase } from "./config.js";
import { post, get } from "./api.js";
import { serve } from "./mcp.js";

export async function main(argv) {
  const cmd = argv[0] ?? "help";
  switch (cmd) {
    case "serve": {
      const cfg = loadConfig();
      serve({ company: argv[1] || cfg.company });
      return; // 常驻,直到 harness 关闭
    }
    case "init":
      return init(argv.slice(1).join(" ").trim());
    case "clockout":
      return clockout();
    case "status":
      return status();
    case "login":
      return login(argv[1], argv[2]);
    default:
      console.log(`agentosity — AI-native is a number now.

用法:
  npx agentosity init <公司名>    绑定公司 + 给 harness 装上自动考勤
  npx agentosity clockout         人类下班打卡
  npx agentosity status           看榜:在岗 Agent / Agent 加班榜
  npx agentosity login <邮箱>     发验证码;再跑 login <邮箱> <验证码> 完成登录
  npx agentosity serve            (由 harness 自动拉起)stdio MCP 考勤进程
`);
  }
}

async function init(company) {
  if (!company) {
    console.error("用法:npx agentosity init <公司名>");
    process.exit(1);
  }
  const cfg = saveConfig({ company });
  console.log(`✅ 已绑定公司:${company}`);

  // Claude Code:有 claude CLI 就直接装
  let claudeOk = false;
  try {
    execFileSync("claude", ["mcp", "add", "--scope", "user", "agentosity", "--", "npx", "-y", "agentosity", "serve"], {
      stdio: "pipe",
      timeout: 15000,
    });
    claudeOk = true;
    console.log("✅ Claude Code:已注册 MCP 考勤(全局)");
  } catch {
    /* 没装 claude CLI,走手动 */
  }

  console.log(`
从现在起,你的 Agent 会话会自动打卡考勤——模型零参与,只上报时长,不读任何内容。

${claudeOk ? "" : `Claude Code 手动配置:
  claude mcp add --scope user agentosity -- npx -y agentosity serve
`}Codex CLI(~/.codex/config.toml 追加):
  [mcp_servers.agentosity]
  command = "npx"
  args = ["-y", "agentosity", "serve"]

其他支持 stdio MCP 的 harness 同理:命令 npx,参数 -y agentosity serve

看榜:${apiBase()}/agents
设备 ID:${cfg.deviceId}
`);
}

async function login(email, code) {
  if (!email) {
    console.error("用法:npx agentosity login <邮箱>,收到验证码后再跑 login <邮箱> <验证码>");
    process.exit(1);
  }
  if (!code) {
    const r = await post("/api/auth/send", { email });
    if (r?.ok) console.log(`✅ 验证码已发到 ${email},收到后跑:npx agentosity login ${email} <验证码>`);
    else {
      console.error(`发送失败:${r?.error ?? "网络不可达"}`);
      process.exit(1);
    }
    return;
  }
  const cfg = saveConfig({}); // 确保 deviceId 存在
  const r = await post("/api/auth/verify", { email, code, deviceId: cfg.deviceId });
  if (r?.ok) {
    saveConfig({ email: r.email, accessToken: r.access_token });
    console.log(`✅ 已登录 ${r.email},这台设备的历史记录已并入账号`);
  } else {
    console.error(`登录失败:${r?.error ?? "验证码不对或已过期"}`);
    process.exit(1);
  }
}

async function clockout() {
  const cfg = loadConfig();
  if (!cfg.company) {
    console.error("还没绑定公司,先跑:npx agentosity init <公司名>");
    process.exit(1);
  }
  const list = await get(`/api/companies?q=${encodeURIComponent(cfg.company)}`);
  const match = list?.find?.((c) => c.name === cfg.company) ?? list?.[0];
  if (!match) {
    console.error(`找不到公司「${cfg.company}」,检查网络或重新 init`);
    process.exit(1);
  }
  const r = await post("/api/checkin", { companyId: match.id, deviceId: cfg.deviceId });
  if (r?.ok) {
    console.log(`✅ 下班快乐!${cfg.company} · ${r.clocked_local}`);
    if (r.note) console.log(`   ${r.note}`);
    console.log(`   明早 10:00 揭榜:${apiBase()}/me`);
  } else {
    console.error(`打卡失败:${r?.error ?? "网络不可达"}`);
    process.exit(1);
  }
}

async function status() {
  const d = await get("/api/agents");
  if (!d?.live) {
    console.error("拿不到数据,检查网络");
    process.exit(1);
  }
  console.log(`🤖 此刻全网 ${d.live.total} 个 Agent 在岗\n`);
  console.log("Agent 加班榜(近 7 天,Active Agent-Hours):");
  (d.board ?? []).slice(0, 10).forEach((r, i) => {
    const live = r.live_now > 0 ? ` · ● 在岗 ${r.live_now}` : "";
    console.log(
      `${String(i + 1).padStart(2)}. ${r.name} — ${r.active_hours}h · 会话 ${r.sessions} · 加班 ${r.overtime_hours}h · Leverage ${r.leverage ?? "—"}${live}`
    );
  });
}

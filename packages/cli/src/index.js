import { loadConfig, saveConfig, apiBase } from "./config.js";
import { post, get } from "./api.js";
import { serve } from "./mcp.js";
import { installAllHarnesses, formatInstallResults } from "./harness-config.js";
import { runRadar } from "./radar.js";

export async function main(argv) {
  const cmd = argv[0] ?? "help";
  switch (cmd) {
    case "serve": {
      const cfg = loadConfig();
      serve({ company: argv[1] || cfg.company, deviceId: cfg.deviceId });
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
    case "radar":
      return runRadar();
    default:
      console.log(`agentosity — AI-native is a number now.

两步开始:
  npx agentosity login                   # 1. 弹浏览器登录
  npx agentosity init "<公司名>"          # 2. 绑定公司 + 自动接入所有 harness
  (无浏览器环境:login <邮箱> 收验证码,再 login <邮箱> <验证码>)

其他:
  npx agentosity radar            进程雷达:补录本机未接入 MCP 的 Agent 会话(常驻)
  npx agentosity status           看榜 + 你的 Agent 今日战报
  npx agentosity clockout         人类下班打卡
  npx agentosity serve            (由 harness 自动拉起)stdio MCP 考勤进程
`);
  }
}

async function init(company) {
  const pre = loadConfig();
  if (!pre.accessToken) {
    console.error(`Agentosity 需要登录使用:
  npx agentosity login <邮箱>            # 收验证码
  npx agentosity login <邮箱> <验证码>    # 登录
然后再跑 init。`);
    process.exit(1);
  }
  if (!company) {
    console.error('用法:npx agentosity init "你的公司名"');
    process.exit(1);
  }
  saveConfig({ company });

  // 服务端绑定公司(唯一真相;改绑每周一次)
  const created = await post("/api/companies", { name: company });
  if (created?.id) {
    const bind = await post("/api/profile", { companyId: created.id }, { method: "PUT" });
    if (bind?.error) console.log(`⚠️ ${bind.error}(本地归属仍按「${company}」记)`);
    else console.log(`✅ 公司已绑定:${created.name ?? company}`);
  } else {
    console.log(`⚠️ 公司绑定暂未同步(网络?),本地归属按「${company}」记`);
  }

  // 全家 harness 自动接入
  console.log("\n接入 Agent 考勤:");
  const results = installAllHarnesses();
  console.log(formatInstallResults(results) || "  (未发现已安装的 harness)");

  console.log(`
从现在起,新开的 Agent 会话会自动考勤——模型零参与,只上报时长,不读任何内容。
已开着的老会话不会被追踪(配置只对新会话生效),要收编它们:npx agentosity radar

看榜:${apiBase()}/agents`);
}

async function login(email, code) {
  // 不带参数:浏览器登录(像 npm login / gh auth login 一样)
  if (!email) return browserLogin();
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
    saveConfig({ email: r.email, accessToken: r.access_token, refreshToken: r.refresh_token });
    console.log(`✅ 已登录 ${r.email},这台设备的历史记录已并入账号`);
  } else {
    console.error(`登录失败:${r?.error ?? "验证码不对或已过期"}`);
    process.exit(1);
  }
}

async function browserLogin() {
  const cfg = saveConfig({}); // 确保 deviceId 存在
  const start = await post("/api/device/start", {});
  if (!start?.code) {
    console.error("无法发起登录(网络不可达)");
    process.exit(1);
  }
  const url = `${apiBase()}/login?device=${start.code}`;
  console.log(`在浏览器里完成登录…\n打不开就手动访问:${url}`);
  try {
    const { spawn } = await import("node:child_process");
    const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    const child = spawn(opener, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" });
    child.on("error", () => {});
    child.unref();
  } catch {
    /* 打不开浏览器就靠上面打印的 URL */
  }
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await post(`/api/device/poll?code=${start.code}`, undefined, { method: "GET" });
    if (poll?.ok && poll.access_token) {
      saveConfig({ email: poll.email, accessToken: poll.access_token, refreshToken: poll.refresh_token });
      await post("/api/auth/merge", { deviceId: cfg.deviceId }); // 设备历史并入账号
      console.log(`✅ 已登录 ${poll.email}`);
      return;
    }
    if (poll?.expired) {
      console.error("登录超时,再跑一次 npx agentosity login");
      process.exit(1);
    }
  }
  console.error("登录超时,再跑一次 npx agentosity login");
  process.exit(1);
}

async function clockout() {
  const cfg = loadConfig();
  if (!cfg.accessToken) {
    console.error("需要先登录:npx agentosity login <邮箱>");
    process.exit(1);
  }
  const r = await post("/api/checkin", { deviceId: cfg.deviceId });
  if (r?.ok) {
    console.log(`✅ 下班快乐!${r.clocked_local}`);
    if (r.rank_company != null) console.log(`   你是公司今天第 ${r.rank_company} 个下班的 · 全网第 ${r.rank_global} 个`);
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
  const w = d.live.working ?? 0;
  const i = d.live.idle ?? 0;
  console.log(`🤖 此刻全网 ${d.live.total} 个 Agent 在岗(⚡${w} 干活 · 😴${i} 挂机)\n`);

  // 个人战报(登录或有设备身份时)
  const cfg = loadConfig();
  if (cfg.accessToken || cfg.deviceId) {
    const mine = await get(`/api/my-agents?device=${cfg.deviceId ?? ""}`);
    if (mine?.sessions > 0) {
      console.log(
        `⚡️ 你的 Agent 今天:干活 ${mine.active_hours}h · 会话 ${mine.sessions} 个 · 在岗 ${mine.session_hours}h · 此刻 ${mine.live_now} 个在跑`
      );
    }
    const today = await get(`/api/my-today?device=${cfg.deviceId ?? ""}`);
    if (today?.checked_in) {
      console.log(`✅ 你今天 ${today.clocked_local} 已打卡下班${today.company ? `(${today.company})` : ""}`);
    }
    console.log("");
  }
  console.log("Agent 加班榜(近 7 天,Active Agent-Hours):");
  (d.board ?? []).slice(0, 10).forEach((r, i) => {
    const live = r.live_now > 0 ? ` · ● 在岗 ${r.live_now}` : "";
    console.log(
      `${String(i + 1).padStart(2)}. ${r.name} — ${r.active_hours}h · 会话 ${r.sessions} · 加班 ${r.overtime_hours}h · Leverage ${r.leverage ?? "—"}${live}`
    );
  });
}

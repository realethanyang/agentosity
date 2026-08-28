import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { post, get } from "./api.js";
import { loadConfig } from "./config.js";

/**
 * 进程雷达(CLI 版,与 menu bar App 内的雷达同一套逻辑):
 * 扫描本机 harness 进程,把没有 MCP 考勤的会话补录入册。
 * 前台常驻,Ctrl+C 优雅收尾。v1 支持 macOS / Linux。
 */

const TICK_MS = 30_000;
const HARNESSES = [
  ["claude", "claude-code"],
  ["codex", "codex"],
  ["opencode", "opencode"],
  ["gemini", "gemini-cli"],
];

function sh(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", timeout: 5000 });
  } catch {
    return "";
  }
}

const pgrepExact = (name) =>
  sh("pgrep", ["-x", name]).split("\n").map((s) => parseInt(s, 10)).filter(Boolean);
const childrenOf = (pid) =>
  sh("pgrep", ["-P", String(pid)]).split("\n").map((s) => parseInt(s, 10)).filter(Boolean);
const commandOf = (pid) => sh("ps", ["-o", "command=", "-p", String(pid)]);

function cpuSecondsOf(pid) {
  const raw = sh("ps", ["-o", "time=", "-p", String(pid)]).trim();
  if (!raw) return 0;
  return raw.split(":").reverse().reduce((acc, part, i) => acc + parseFloat(part) * 60 ** i, 0);
}

function cwdOf(pid) {
  const out = sh("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"]);
  for (const line of out.split("\n")) {
    if (line.startsWith("n")) return line.slice(1);
  }
  return null;
}

function sessionArtifact(harness, cwd) {
  const home = homedir();
  switch (harness) {
    case "claude-code": {
      if (!cwd) return null;
      const slug = cwd.replace(/[/.\s_]/g, "-");
      return join(home, ".claude", "projects", slug);
    }
    case "codex": {
      const d = new Date();
      return join(
        home, ".codex", "sessions",
        String(d.getFullYear()),
        String(d.getMonth() + 1).padStart(2, "0"),
        String(d.getDate()).padStart(2, "0")
      );
    }
    case "opencode":
      return join(home, ".local", "share", "opencode", "opencode.db-wal");
    case "gemini-cli":
      return cwd ? join(home, ".gemini", "tmp", createHash("sha256").update(cwd).digest("hex")) : null;
    default:
      return null;
  }
}

function newestMtimeMs(path) {
  try {
    const st = statSync(path);
    if (st.isFile()) return st.mtimeMs;
    let newest = 0;
    for (const f of readdirSync(path)) {
      try {
        const m = statSync(join(path, f)).mtimeMs;
        if (m > newest) newest = m;
      } catch { /* 忽略单个文件错误 */ }
    }
    return newest;
  } catch {
    return 0;
  }
}

export async function runRadar() {
  if (process.platform === "win32") {
    console.error("进程雷达 v1 支持 macOS / Linux;Windows 请先用 MCP 接入(npx agentosity init),雷达支持在路上。");
    process.exit(1);
  }
  // menu bar App 自带雷达,俩雷达一起跑会重复记账
  if (sh("pgrep", ["-x", "Agentosity"]).trim() && !process.argv.includes("--force")) {
    console.error("检测到 Agentosity 菜单栏 App 正在运行(它自带雷达),无需再跑 CLI 雷达。确要双开:加 --force");
    process.exit(1);
  }
  const cfg = loadConfig();
  if (!cfg.accessToken) {
    console.error("需要先登录:npx agentosity login <邮箱>");
    process.exit(1);
  }
  const prof = await get(`/api/profile?device=${cfg.deviceId ?? ""}`);
  const company = prof?.company?.name ?? cfg.company;
  if (!company) {
    console.error("还没绑定公司:先跑 npx agentosity init \"你的公司名\"");
    process.exit(1);
  }

  console.log(`📡 进程雷达启动 · 公司:${company} · 每 30 秒扫描一次(Ctrl+C 退出并收尾)`);
  const tracked = new Map(); // pid → {sessionId, harness, cwd, activeSeconds, baseline:Set|null, lastCpu}

  async function endAll() {
    for (const [, t] of tracked) {
      if (t.sessionId) {
        await post("/api/agent/end", { session_id: t.sessionId, active_seconds: t.activeSeconds }, { timeoutMs: 3000 });
      }
    }
    tracked.clear();
  }
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    console.log("\n收尾中…");
    await endAll();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  async function tick() {
    const found = new Map();
    for (const [bin, harness] of HARNESSES) {
      for (const pid of pgrepExact(bin)) found.set(pid, harness);
    }
    // 消失 → 下班
    for (const [pid, t] of [...tracked]) {
      if (!found.has(pid)) {
        if (t.sessionId) await post("/api/agent/end", { session_id: t.sessionId, active_seconds: t.activeSeconds });
        tracked.delete(pid);
        console.log(`↓ 会话结束 pid=${pid}`);
      }
    }
    // 新进程 → 入册(已有 MCP 考勤的跳过)
    for (const [pid, harness] of found) {
      if (tracked.has(pid)) continue;
      if (childrenOf(pid).some((c) => commandOf(c).includes("agentosity"))) continue;
      const cwd = cwdOf(pid);
      const r = await post("/api/agent/start", {
        company, harness, probe: "radar", deviceId: cfg.deviceId,
      });
      tracked.set(pid, {
        sessionId: r?.session_id ?? null, harness, cwd,
        activeSeconds: 0, baseline: null, lastCpu: -1,
      });
      console.log(`↑ 补录 ${harness} pid=${pid}${cwd ? ` (${cwd})` : ""}`);
    }
    // 目录共享判定
    const artifactCount = new Map();
    for (const [, t] of tracked) {
      const a = sessionArtifact(t.harness, t.cwd);
      if (a) artifactCount.set(a, (artifactCount.get(a) ?? 0) + 1);
    }
    // 心跳 + 活跃度(CPU 增量 / 基线外子进程 / 独占目录写盘)
    for (const [pid, t] of tracked) {
      if (!t.sessionId) continue;
      let active = false;
      const cpu = cpuSecondsOf(pid);
      if (t.lastCpu >= 0 && cpu - t.lastCpu > 1.0) active = true;
      t.lastCpu = cpu;

      const children = new Set(childrenOf(pid));
      if (t.baseline === null) {
        t.baseline = children;
      } else {
        t.baseline = new Set([...t.baseline].filter((p) => children.has(p)));
        for (const c of children) if (!t.baseline.has(c)) { active = true; break; }
      }

      if (!active) {
        const a = sessionArtifact(t.harness, t.cwd);
        if (a && artifactCount.get(a) === 1 && existsSync(a)) {
          if (Date.now() - newestMtimeMs(a) < 90_000) active = true;
        }
      }
      if (active) t.activeSeconds += TICK_MS / 1000;
      await post("/api/agent/heartbeat", {
        session_id: t.sessionId, active_seconds: Math.round(t.activeSeconds), probe: "radar", active,
      });
    }
    process.stdout.write(`\r📡 在册 ${tracked.size} 个会话  `);
  }

  // 主循环
  for (;;) {
    try {
      await tick();
    } catch {
      /* 单轮失败不退出 */
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

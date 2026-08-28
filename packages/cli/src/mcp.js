import { createInterface } from "node:readline";
import { post, get } from "./api.js";
import { detectHarness, createProbe } from "./probes.js";

const TICK_MS = parseInt(process.env.AGENTOSITY_TICK_MS ?? "", 10) || 15_000; // 活跃度采样间隔
const HEARTBEAT_MS = parseInt(process.env.AGENTOSITY_HB_MS ?? "", 10) || 60_000; // 上报间隔;服务端以最后心跳结算,误差 ≤1min

/**
 * stdio MCP 考勤服务:harness 拉起本进程即上班,杀掉即下班。
 * 模型零参与:initialize 握手 = start,stdin EOF / SIGTERM = end(遗言),心跳为准。
 */
export function serve({ company, deviceId }) {
  const startMs = Date.now();
  let sessionId = null;
  let startPromise = null;
  let harness = "unknown";
  let probe = null;
  let probeLabel = "none";
  let activeSeconds = 0;
  let lastTick = Date.now();
  let ended = false;

  const write = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

  function startSession() {
    if (!company || startPromise) return;
    startPromise = post("/api/agent/start", { company, harness, probe: probeLabel, deviceId }).then((r) => {
      if (r?.session_id) sessionId = r.session_id;
    });
  }

  const tickTimer = setInterval(() => {
    const now = Date.now();
    if (probe) {
      try {
        const s = probe.sample();
        probeLabel = s.probe;
        if (s.active) {
          activeSeconds = Math.min(
            activeSeconds + Math.round((now - lastTick) / 1000),
            Math.round((now - startMs) / 1000) // 活跃时长不可能超过在岗墙钟
          );
        }
      } catch {
        /* 探针永不致命 */
      }
    }
    lastTick = now;
  }, TICK_MS);

  const hbTimer = setInterval(() => {
    if (sessionId) {
      post("/api/agent/heartbeat", {
        session_id: sessionId,
        active_seconds: activeSeconds,
        probe: probeLabel,
      });
    }
  }, HEARTBEAT_MS);

  async function endSession(code = 0) {
    if (ended) return;
    ended = true;
    clearInterval(tickTimer);
    clearInterval(hbTimer);
    // start 可能还在途(会话开得快关得也快时):先等它落地,才能报 end
    if (startPromise) {
      await Promise.race([startPromise, new Promise((r) => setTimeout(r, 3000))]);
    }
    if (sessionId) {
      // 遗言:harness 关闭时抢发,超时就放弃(服务端有心跳兜底)
      await post(
        "/api/agent/end",
        { session_id: sessionId, active_seconds: activeSeconds },
        { timeoutMs: 2500 }
      );
    }
    process.exit(code);
  }
  process.on("SIGTERM", () => endSession());
  process.on("SIGINT", () => endSession());
  process.on("SIGHUP", () => endSession());

  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on("close", () => endSession());

  rl.on("line", async (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    try {
      await handle(msg);
    } catch {
      if (msg?.id !== undefined) {
        write({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "Internal error" } });
      }
    }
  });

  async function handle(msg) {
    switch (msg.method) {
      case "initialize": {
        harness = detectHarness(msg.params?.clientInfo);
        probe = createProbe(harness, startMs);
        write({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            protocolVersion: msg.params?.protocolVersion ?? "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "agentosity", version: "0.1.0" },
          },
        });
        startSession();
        break;
      }
      case "notifications/initialized":
      case "notifications/cancelled":
        break;
      case "ping":
        write({ jsonrpc: "2.0", id: msg.id, result: {} });
        break;
      case "tools/list":
        write({
          jsonrpc: "2.0",
          id: msg.id,
          result: {
            tools: [
              {
                name: "agentosity_status",
                description:
                  "查看下班榜 / Agentosity 实时榜单:当前在岗 Agent 数、Agent 加班榜前五。打卡是自动的,此工具仅供查询。",
                inputSchema: { type: "object", properties: {} },
              },
            ],
          },
        });
        break;
      case "tools/call": {
        let text = "暂时拿不到榜单数据(网络不可达)。考勤不受影响,打卡是自动的。";
        const d = await get("/api/agents");
        if (d?.live) {
          const rows = (d.board ?? [])
            .slice(0, 5)
            .map((r, i) => `${i + 1}. ${r.name} — Active ${r.active_hours}h · 在岗 ${r.live_now}`)
            .join("\n");
          text = `此刻全网 ${d.live.total} 个 Agent 在岗。\n\nAgent 加班榜(近 7 天):\n${rows}`;
        }
        write({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text }] } });
        break;
      }
      default:
        if (msg.id !== undefined) {
          write({ jsonrpc: "2.0", id: msg.id, error: { code: -32601, message: "Method not found" } });
        }
    }
  }
}

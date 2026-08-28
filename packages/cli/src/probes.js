import { readdirSync, statSync, openSync, readSync, closeSync, fstatSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

/**
 * 活跃度探针:回答"此刻 Agent 是否在干活"。
 * 三信号取并集:会话文件最近有写入 / 尾巴是在途工具调用 / harness 有活跃子进程。
 * 只 stat 文件、只解析最后一行的事件类型字段,绝不读取对话内容。
 */

const RECENT_WRITE_MS = 90_000; // 距上次写盘 90s 内视为活跃(覆盖流式输出间隙)

export function detectHarness(clientInfo) {
  const n = (clientInfo?.name ?? "").toLowerCase();
  if (n.includes("claude")) return "claude-code";
  if (n.includes("codex")) return "codex";
  if (n.includes("gemini")) return "gemini-cli";
  if (n.includes("cursor")) return "cursor";
  if (n.includes("cline")) return "cline";
  return n || "unknown";
}

/** Claude Code:~/.claude/projects/<cwd-slug>/<session>.jsonl */
function claudeSessionDir() {
  const slug = process.cwd().replace(/[/.\s_]/g, "-");
  return join(homedir(), ".claude", "projects", slug);
}

/** Codex:~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl */
function codexSessionDir() {
  const d = new Date();
  return join(
    homedir(), ".codex", "sessions",
    String(d.getFullYear()),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0")
  );
}

export function createProbe(harness, processStartMs) {
  const state = {
    kind: "none",
    file: null,
    lastMtimeMs: 0,
    lastWriteAt: 0,
  };

  const dirOf = { "claude-code": claudeSessionDir, codex: codexSessionDir }[harness];

  function bindFile() {
    if (state.file || !dirOf) return;
    try {
      const dir = dirOf();
      const candidates = readdirSync(dir)
        .filter((f) => f.endsWith(".jsonl"))
        .map((f) => {
          const p = join(dir, f);
          const st = statSync(p);
          return { p, birth: st.birthtimeMs || st.ctimeMs, mtime: st.mtimeMs };
        })
        // 会话文件在首条消息时才创建,允许比进程启动早 2 分钟(时钟偏差)之后的任何时间
        .filter((c) => c.birth >= processStartMs - 120_000)
        .sort((a, b) => b.birth - a.birth);
      if (candidates.length > 0) {
        state.file = candidates[0].p;
        state.kind = "file-mtime";
        state.lastMtimeMs = candidates[0].mtime;
        state.lastWriteAt = Date.now();
      }
    } catch {
      /* 目录不存在/无权限 → 保持降级 */
    }
  }

  /** 信号 1:文件最近有写入 */
  function recentWrite() {
    if (!state.file) return false;
    try {
      const st = statSync(state.file);
      if (st.mtimeMs > state.lastMtimeMs) {
        state.lastMtimeMs = st.mtimeMs;
        state.lastWriteAt = Date.now();
      }
      return Date.now() - state.lastWriteAt < RECENT_WRITE_MS;
    } catch {
      state.file = null; // 文件消失 → 解绑重找
      state.kind = "none";
      return false;
    }
  }

  /** 信号 2:尾巴状态 — 最后一个事件是发起工具调用且尚无结果 → 工具在途 */
  function toolInFlight() {
    if (!state.file) return false;
    try {
      const fd = openSync(state.file, "r");
      const size = fstatSync(fd).size;
      const len = Math.min(size, 64 * 1024);
      const buf = Buffer.alloc(len);
      readSync(fd, buf, 0, len, size - len);
      closeSync(fd);
      const lines = buf.toString("utf8").split("\n").filter((l) => l.trim());
      const last = lines[lines.length - 1];
      if (!last) return false;
      // 只判断事件形态,不读内容:tool_use 出现且其后无 tool_result
      const lastToolUse = last.lastIndexOf('"tool_use"');
      const lastToolResult = last.lastIndexOf('"tool_result"');
      return lastToolUse > -1 && lastToolUse > lastToolResult;
    } catch {
      return false;
    }
  }

  /** 信号 3:harness(父进程)有除本进程外的子进程在跑(长工具调用) */
  function childActive() {
    try {
      const out = execFileSync("pgrep", ["-P", String(process.ppid)], {
        encoding: "utf8",
        timeout: 3000,
      });
      const others = out
        .split("\n")
        .map((s) => parseInt(s, 10))
        .filter((pid) => pid && pid !== process.pid);
      return others.length > 0;
    } catch {
      return false; // pgrep 无匹配时 exit 1,也走这里 → 视为无子进程
    }
  }

  return {
    /** 每个 tick 调用:返回 { active, probe } */
    sample() {
      bindFile();
      const signals = {
        write: recentWrite(),
        inflight: toolInFlight(),
        child: childActive(),
      };
      const probe = state.kind === "file-mtime" ? "file-mtime" : "proc-tree";
      return { active: signals.write || signals.inflight || signals.child, probe, signals };
    },
  };
}

"use client";

import { useEffect, useState } from "react";

type AgentRow = {
  name: string;
  active_hours: number;
  session_hours: number;
  overtime_hours: number;
  sessions: number;
  human_hours: number;
  leverage: number | null;
  live_now: number;
};
type Live = {
  total: number;
  working: number;
  idle: number;
  by_company: { name: string; harness: string; working: boolean; since_minutes: number }[];
};

const CMD_BLOCK = `npx agentosity login you@example.com     # 1. 收验证码
npx agentosity login you@example.com 123456   # 2. 登录
npx agentosity init "你的公司名"               # 3. 自动接入所有 harness`;

export default function AgentsPage() {
  const [board, setBoard] = useState<AgentRow[] | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isMac, setIsMac] = useState(true);
  const [showCmd, setShowCmd] = useState(false);

  useEffect(() => {
    setIsMac(/Mac/i.test(navigator.platform || navigator.userAgent));
  }, []);

  useEffect(() => {
    const load = () =>
      fetch("/api/agents")
        .then((r) => r.json())
        .then((d) => {
          setBoard(d.board);
          setLive(d.live);
          setPeriod(d.period);
        });
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-4xl font-black">Agentosity</h1>
      <p className="mt-1 text-lg font-bold">AI-native is a number now.</p>
      <p className="text-sm font-bold opacity-60">
        Agent 在替你加班,所以你才能早下班。公司越 AI-native,人走得越早。
      </p>

      {/* 在岗实况 */}
      <section className="nb-card mt-6 bg-[var(--nb-ink)] p-5 text-white">
        <div className="text-2xl font-black">
          🤖 此刻 {live?.total ?? "…"} 个 Agent 在上班
          {live != null && live.total > 0 && (
            <span className="ml-2 text-base font-bold opacity-80">
              ⚡ {live.working} 个在干活 · 😴 {live.idle} 个挂机中
            </span>
          )}
        </div>
        {live && live.by_company.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            {live.by_company.map((a, i) => (
              <span key={i} className="border-2 border-white px-2 py-1">
                {a.working ? "⚡" : "😴"} {a.name} · {a.harness} · 已上班 {a.since_minutes} 分钟
              </span>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs font-bold opacity-60">
          ⚡ 在干活 = 探针检测到最近 3 分钟有真实活动;😴 挂机 = 会话开着但没动静
        </p>
      </section>

      {/* Agent 榜 */}
      <section className="nb-card mt-6 overflow-x-auto bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-xl font-black sm:text-2xl">Agent 加班榜</h2>
          <span className="text-xs font-bold opacity-60">
            {period ? `${period.from} ~ ${period.to}` : ""} · 按 Active Agent-Hours
          </span>
        </div>
        {!board ? (
          <p className="py-10 text-center font-bold opacity-50">加载中…</p>
        ) : (
          <table className="mt-4 w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b-3 text-left font-black" style={{ borderBottom: "3px solid var(--nb-ink)" }}>
                <th className="py-2">#</th>
                <th>公司</th>
                <th className="text-right">Agent 工时</th>
                <th className="text-right">会话数</th>
                <th className="text-right">Agent 加班</th>
                <th className="text-right">Leverage</th>
                <th className="text-right">在岗</th>
              </tr>
            </thead>
            <tbody className="font-bold">
              {board.slice(0, 15).map((r, i) => (
                <tr key={r.name} className="border-b border-dashed border-black/20">
                  <td className="py-2 font-black">{i + 1}</td>
                  <td>{r.name}</td>
                  <td className="text-right tabular-nums font-black">{r.active_hours}h</td>
                  <td className="text-right tabular-nums">{r.sessions}</td>
                  <td className="text-right tabular-nums">{r.overtime_hours}h</td>
                  <td className="text-right tabular-nums">{r.leverage ?? "—"}</td>
                  <td className="text-right">
                    {r.live_now > 0 ? (
                      <span className="bg-[var(--nb-green)] px-2 py-0.5 text-xs font-black">● {r.live_now}</span>
                    ) : (
                      <span className="opacity-30">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs font-bold opacity-50">
          Agent 工时 = 探针过滤后的活跃时长(Active Agent-Hours);Leverage = Agent 工时 ÷ 人类工时
        </p>
      </section>

      {/* 接入(按平台分流:mac 主推 App,其他平台主推命令) */}
      <section className="nb-card mt-6 bg-[var(--nb-yellow)] p-5">
        <h2 className="text-2xl font-black">让你的 Agent 也上榜</h2>
        <p className="mt-1 text-sm font-bold">自动考勤,不用改任何 prompt。</p>

        {isMac ? (
          <>
            <div className="nb-card mt-3 flex flex-wrap items-center justify-between gap-3 bg-white p-4">
              <div>
                <div className="text-lg font-black">🖥 下载 mac 菜单栏 App(推荐)</div>
                <p className="mt-1 text-xs font-bold opacity-70">
                  登录 → 绑公司 → 一键接入。📡 雷达还会自动补录本机已开着的 Agent 会话,零终端。
                </p>
              </div>
              <a
                href="https://github.com/realethanyang/agentosity/releases/latest/download/Agentosity.app.zip"
                className="nb-btn bg-[var(--nb-ink)] px-4 py-2 text-sm font-black text-white"
              >
                下载 ↓
              </a>
            </div>
            <p className="mt-1 text-xs font-bold opacity-50">
              解压拖进「应用程序」;首次打开若被拦截:右键 → 打开
            </p>
            <button onClick={() => setShowCmd(!showCmd)} className="mt-2 text-xs font-bold underline opacity-60">
              {showCmd ? "收起" : "不想装 App?用终端命令(全平台通用)→"}
            </button>
          </>
        ) : (
          <p className="mt-2 text-xs font-bold opacity-70">三行命令(需要 Node.js):</p>
        )}

        {(!isMac || showCmd) && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(CMD_BLOCK.replace(/\s+#[^\n]*/g, "")).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              });
            }}
            className="nb-card mt-3 block w-full cursor-pointer overflow-x-auto bg-[var(--nb-ink)] p-4 text-left text-sm font-bold text-white"
            title="点击复制(不含注释)"
          >
            <span className="flex items-start justify-between gap-3">
              <code className="whitespace-pre">{CMD_BLOCK}</code>
              <span className="shrink-0 text-xs opacity-70">{copied ? "✅ 已复制" : "📋 点击复制"}</span>
            </span>
          </button>
        )}
        <div className="mt-3 text-xs font-bold">
          <span className="opacity-70">支持的 Agent Harness:</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {["Claude Code", "Codex CLI", "OpenCode", "Gemini CLI", "Cursor", "Cline", "Windsurf"].map((h) => (
              <span key={h} className="border-2 border-black bg-white px-2 py-0.5">{h}</span>
            ))}
            <span className="px-1 py-0.5 opacity-60">…任何支持 stdio MCP 的 harness</span>
          </div>
          <p className="mt-1 opacity-70">
            活跃度探针(区分干活/挂机)精确支持 Claude Code / Codex / OpenCode / Gemini CLI,其余按在岗时长计。
          </p>
        </div>
        <p className="mt-2 text-xs font-bold opacity-70">
          原理:注册一个极薄的本地 MCP 考勤进程,会话开始/结束自动打卡,
          只上报时长,绝不读取你的代码和对话内容。
          <a href="https://github.com/realethanyang/agentosity" target="_blank" rel="noopener" className="underline">
            开源可审计 ↗
          </a>
        </p>
      </section>
    </main>
  );
}

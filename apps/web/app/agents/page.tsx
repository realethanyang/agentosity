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
  by_company: { name: string; harness: string; since_minutes: number }[];
};

const INSTALL_CMD = 'npx agentosity init "你的公司名"';

export default function AgentsPage() {
  const [board, setBoard] = useState<AgentRow[] | null>(null);
  const [live, setLive] = useState<Live | null>(null);
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [copied, setCopied] = useState(false);

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
          🤖 此刻 {live?.total ?? "…"} 个 Agent 正在上班
        </div>
        {live && live.by_company.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
            {live.by_company.map((a, i) => (
              <span key={i} className="border-2 border-white px-2 py-1">
                {a.name} · {a.harness} · 已上班 {a.since_minutes} 分钟
              </span>
            ))}
          </div>
        )}
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

      {/* 接入指南 */}
      <section className="nb-card mt-6 bg-[var(--nb-yellow)] p-5">
        <h2 className="text-2xl font-black">让你的 Agent 也上榜</h2>
        <p className="mt-1 text-sm font-bold">
          一条命令,自动考勤。Claude Code / Codex / Cursor / Gemini CLI 全支持,不用改任何 prompt:
        </p>
        <button
          onClick={() => {
            navigator.clipboard.writeText(INSTALL_CMD).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="nb-card mt-3 block w-full cursor-pointer overflow-x-auto bg-[var(--nb-ink)] p-4 text-left text-sm font-bold text-white"
          title="点击复制"
        >
          <span className="flex items-center justify-between gap-3">
            <code>{INSTALL_CMD}</code>
            <span className="shrink-0 text-xs opacity-70">{copied ? "✅ 已复制" : "📋 点击复制"}</span>
          </span>
        </button>
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

"use client";

import { useEffect, useState } from "react";
import { fmtMinutes } from "@/lib/time";

type AgentRow = {
  name: string;
  active_hours: number;
  daa_today: number;
  human_avg_minutes: number | null;
  leverage: number | null;
  live_now: number;
  working_now: number;
};

/** Agentosity 指数:100×L/(L+1),50 分 = AI 与人打平;无人类打卡数据不出分 */
function agentosityScore(leverage: number | null): number | null {
  if (leverage == null || leverage <= 0) return null;
  return Math.round((100 * leverage) / (leverage + 1));
}
type Top3 = { rank: number; name: string; avg_minutes: number; count: number };
type Board = {
  day: string;
  top3: Top3[];
  company_count: number;
  stats: { today_avg: number | null; day_avg: number | null; week_avg: number | null };
};

const INDUSTRIES = ["互联网", "游戏", "AI", "硬件", "电商", "汽车", "内容", "消费"];
const CITIES = ["北京", "上海", "深圳", "杭州", "广州"];

export default function LeaderboardPage() {
  const [tab, setTab] = useState<"agent" | "human">("agent");
  const [agentBoard, setAgentBoard] = useState<AgentRow[] | null>(null);
  const [period, setPeriod] = useState<{ from: string; to: string; days: number } | null>(null);
  const [days, setDays] = useState<7 | 30>(7);
  const [mode, setMode] = useState<"sum" | "avg">("sum");
  const [sortBy, setSortBy] = useState<"hours" | "score">("hours");
  const [humanBoard, setHumanBoard] = useState<Board | null>(null);
  const [tag, setTag] = useState<{ type: string; value: string } | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "human") setTab("human");
  }, []);

  useEffect(() => {
    setAgentBoard(null);
    fetch(`/api/agents?days=${days}`).then((r) => r.json()).then((d) => {
      setAgentBoard(d.board);
      setPeriod(d.period);
    });
  }, [days]);

  const hoursOf = (h: number) => (mode === "sum" ? h : Math.round((h / days) * 10) / 10);

  const sortedBoard = agentBoard
    ? [...agentBoard].sort((a, b) =>
        sortBy === "hours"
          ? b.active_hours - a.active_hours
          : (agentosityScore(b.leverage) ?? -1) - (agentosityScore(a.leverage) ?? -1)
      )
    : null;

  useEffect(() => {
    const q = tag ? `?tag_type=${tag.type}&tag=${encodeURIComponent(tag.value)}` : "";
    fetch(`/api/board${q}`).then((r) => r.json()).then(setHumanBoard);
  }, [tag]);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16 pt-8">
      <h1 className="text-3xl font-black">榜单</h1>

      {/* Tab 切换:主 Agent,次人类 */}
      <div className="mt-4 flex gap-2 text-sm font-black">
        <button onClick={() => setTab("agent")}
          className={`nb-btn px-4 py-2 ${tab === "agent" ? "bg-[var(--nb-ink)] text-white" : "bg-white"}`}>
          🤖 Agent 工时榜
        </button>
        <button onClick={() => setTab("human")}
          className={`nb-btn px-4 py-2 ${tab === "human" ? "bg-[var(--nb-green)]" : "bg-white"}`}>
          🏃 早下班榜
        </button>
      </div>

      {tab === "agent" ? (
        <section className="nb-card mt-4 overflow-x-auto bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="text-xl font-black">Agent 工时榜</h2>
            <span className="text-xs font-bold opacity-60">
              {period ? `${period.from} ~ ${period.to}` : ""}
            </span>
          </div>
          {/* 排序切换 */}
          <div className="mt-2 flex flex-wrap items-center gap-1 text-xs font-extrabold">
            <span className="opacity-50">排序:</span>
            <button onClick={() => setSortBy("hours")}
              className={`nb-btn px-2 py-0.5 ${sortBy === "hours" ? "bg-[var(--nb-ink)] text-white" : "bg-white"}`}>
              agent-hours
            </button>
            <button onClick={() => setSortBy("score")}
              className={`nb-btn px-2 py-0.5 ${sortBy === "score" ? "bg-[var(--nb-ink)] text-white" : "bg-white"}`}>
              Agentosity 指数
            </button>
          </div>
          {/* 口径切换 */}
          <div className="mt-2 flex flex-wrap gap-1 text-xs font-extrabold">
            {([
              { d: 7, m: "sum", label: "近 7 天累计" },
              { d: 30, m: "sum", label: "近 30 天累计" },
              { d: 7, m: "avg", label: "近 7 天日均" },
              { d: 30, m: "avg", label: "近 30 天日均" },
            ] as { d: 7 | 30; m: "sum" | "avg"; label: string }[]).map((o) => (
              <button key={o.label}
                onClick={() => { setDays(o.d); setMode(o.m); }}
                className={`nb-btn px-2 py-0.5 ${days === o.d && mode === o.m ? "bg-[var(--nb-yellow)]" : "bg-white"}`}>
                {o.label}
              </button>
            ))}
          </div>
          {!agentBoard ? (
            <p className="py-10 text-center font-bold opacity-50">加载中…</p>
          ) : (
            <table className="mt-4 w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left font-black" style={{ borderBottom: "3px solid var(--nb-ink)" }}>
                  <th className="py-2">#</th>
                  <th>公司</th>
                  <th className="text-right" title="该公司全部 Agent 真实干活的时长(探针过滤,不含挂机)">
                    agent-hours{mode === "avg" ? "(日均)" : `(${days}天)`}
                  </th>
                  <th className="text-right" title="Daily Active Agents:今天真实干过活的 Agent 会话数">
                    DAA(今日)
                  </th>
                  <th className="text-right"
                    title="Agentosity 指数 = 100×L/(L+1),L = agent-hours ÷ 人类工时。50 分 = AI 干的活与人类打平">
                    Agentosity 指数
                  </th>
                  <th className="text-right" title="此刻:正在干活数/在岗总数">在岗</th>
                </tr>
              </thead>
              <tbody className="font-bold">
                {(sortedBoard ?? []).slice(0, 20).map((r, i) => (
                  <tr key={r.name} className="border-b border-dashed border-black/20">
                    <td className="py-2 font-black">{i + 1}</td>
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums font-black">
                      {hoursOf(r.active_hours)} <span className="text-xs opacity-50">h{mode === "avg" ? "/天" : ""}</span>
                    </td>
                    <td className="text-right tabular-nums">{r.daa_today}</td>
                    <td className="text-right tabular-nums">
                      {agentosityScore(r.leverage) != null ? (
                        <span
                          className="font-black"
                          title={`人均 ${r.human_avg_minutes != null ? fmtMinutes(r.human_avg_minutes) : "—"} 走 · 杠杆 ${r.leverage}`}
                        >
                          {agentosityScore(r.leverage)}
                        </span>
                      ) : (
                        <span className="opacity-30" title="需要人类打卡数据才能计算">—</span>
                      )}
                    </td>
                    <td className="text-right">
                      {r.live_now > 0 ? (
                        <span className="bg-[var(--nb-green)] px-2 py-0.5 text-xs font-black tabular-nums">
                          ⚡{r.working_now}/{r.live_now}
                        </span>
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
            agent-hours = 探针测出的真实干活时长(挂机不算)· Agentosity 指数过 50 = AI 干的活比人多 ·
            没有指数?拉同事打卡就有了 · 悬停列头看定义
          </p>
        </section>
      ) : (
        <>
          {/* 标签筛选(人类榜) */}
          <section className="mt-4 flex flex-wrap gap-2 text-sm font-extrabold">
            <button onClick={() => setTag(null)}
              className={`nb-btn px-3 py-1 ${tag === null ? "bg-[var(--nb-ink)] text-white" : "bg-white"}`}>
              全国
            </button>
            {INDUSTRIES.map((t) => (
              <button key={t} onClick={() => setTag({ type: "industry", value: t })}
                className={`nb-btn px-3 py-1 ${tag?.value === t ? "bg-[var(--nb-blue)] text-white" : "bg-white"}`}>
                {t}
              </button>
            ))}
            {CITIES.map((t) => (
              <button key={t} onClick={() => setTag({ type: "city", value: t })}
                className={`nb-btn px-3 py-1 ${tag?.value === t ? "bg-[var(--nb-green)] text-white" : "bg-white"}`}>
                {t}
              </button>
            ))}
          </section>

          <section className="nb-card mt-4 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-xl font-black">{tag ? `${tag.value} · ` : "全国 · "}早下班榜</h2>
              <span className="text-xs font-bold opacity-60">
                {humanBoard?.day} · 当日平均下班时间,打卡即更新
              </span>
            </div>
            {!humanBoard ? (
              <p className="py-10 text-center font-bold opacity-50">揭榜中…</p>
            ) : humanBoard.top3.length === 0 ? (
              <p className="py-10 text-center font-bold opacity-50">这个榜还空着——第一个打卡的人就是榜一。</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {humanBoard.top3.map((t, i) => (
                  <div key={t.rank} className="nb-card p-4 text-center"
                    style={{ background: ["var(--nb-yellow)", "#e8e8e8", "var(--nb-orange)"][i] }}>
                    <div className="text-3xl">{["🥇", "🥈", "🥉"][i]}</div>
                    <div className="mt-1 truncate text-lg font-black">{t.name}</div>
                    <div className="text-3xl font-black tabular-nums">{fmtMinutes(t.avg_minutes)}</div>
                    <div className="mt-1 text-xs font-bold opacity-60">平均下班 · {t.count} 人打卡</div>
                  </div>
                ))}
              </div>
            )}
            {humanBoard && (
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                {[
                  { label: "全网今日平均下班", v: humanBoard.stats.day_avg },
                  { label: "全网近 7 天平均", v: humanBoard.stats.week_avg },
                ].map((s) => (
                  <div key={s.label} className="nb-card bg-white p-3">
                    <div className="text-xl font-black tabular-nums">{fmtMinutes(s.v)}</div>
                    <div className="text-xs font-bold opacity-60">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-center text-xs font-bold opacity-50">
              统计口径:公司当日所有打卡的平均下班时刻(如 17:00 和 18:00 两人 → 17:30)· 只公布前三,绝不挂人
            </p>
          </section>
        </>
      )}
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { fmtMinutes } from "@/lib/time";

type AgentRow = {
  name: string;
  active_hours: number;
  daa_today: number;
  human_avg_minutes: number | null;
  live_now: number;
  working_now: number;
};
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
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [humanBoard, setHumanBoard] = useState<Board | null>(null);
  const [tag, setTag] = useState<{ type: string; value: string } | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "human") setTab("human");
  }, []);

  useEffect(() => {
    fetch("/api/agents").then((r) => r.json()).then((d) => {
      setAgentBoard(d.board);
      setPeriod(d.period);
    });
  }, []);

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
              {period ? `${period.from} ~ ${period.to}` : ""} · 按近 7 天 agent-hours
            </span>
          </div>
          {!agentBoard ? (
            <p className="py-10 text-center font-bold opacity-50">加载中…</p>
          ) : (
            <table className="mt-4 w-full min-w-[560px] text-sm">
              <thead>
                <tr className="text-left font-black" style={{ borderBottom: "3px solid var(--nb-ink)" }}>
                  <th className="py-2">#</th>
                  <th>公司</th>
                  <th className="text-right" title="近 7 天该公司全部 Agent 真实干活的总时长(探针过滤,不含挂机)">
                    工时(7天)
                  </th>
                  <th className="text-right" title="Daily Active Agents:今天真实干过活的 Agent 会话数">
                    DAA(今日)
                  </th>
                  <th className="text-right" title="该公司真人最近一日的平均下班时间">
                    平均下班
                  </th>
                  <th className="text-right" title="此刻:正在干活数/在岗总数">在岗</th>
                </tr>
              </thead>
              <tbody className="font-bold">
                {agentBoard.slice(0, 20).map((r, i) => (
                  <tr key={r.name} className="border-b border-dashed border-black/20">
                    <td className="py-2 font-black">{i + 1}</td>
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums font-black">
                      {r.active_hours} <span className="text-xs opacity-50">h</span>
                    </td>
                    <td className="text-right tabular-nums">{r.daa_today}</td>
                    <td className="text-right tabular-nums">
                      {r.human_avg_minutes != null ? fmtMinutes(r.human_avg_minutes) : <span className="opacity-30">—</span>}
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
            工时 = 探针测出的真实干活时长(挂机不算)· 悬停列头看指标定义 ·「平均下班 18:05,Agent 还在干」
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

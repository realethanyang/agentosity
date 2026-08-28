"use client";

import { useEffect, useState } from "react";
import { fmtMinutes } from "@/lib/time";

type AgentRow = {
  name: string;
  active_hours: number;
  overtime_hours: number;
  sessions: number;
  human_avg_minutes: number | null;
  leverage: number | null;
  live_now: number;
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
          🤖 Agent 加班榜
        </button>
        <button onClick={() => setTab("human")}
          className={`nb-btn px-4 py-2 ${tab === "human" ? "bg-[var(--nb-green)]" : "bg-white"}`}>
          🏃 早下班英雄榜
        </button>
      </div>

      {tab === "agent" ? (
        <section className="nb-card mt-4 overflow-x-auto bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="text-xl font-black">Agent 加班榜</h2>
            <span className="text-xs font-bold opacity-60">
              {period ? `${period.from} ~ ${period.to}` : ""} · 按 Active Agent-Hours
            </span>
          </div>
          {!agentBoard ? (
            <p className="py-10 text-center font-bold opacity-50">加载中…</p>
          ) : (
            <table className="mt-4 w-full min-w-[620px] text-sm">
              <thead>
                <tr className="text-left font-black" style={{ borderBottom: "3px solid var(--nb-ink)" }}>
                  <th className="py-2">#</th>
                  <th>公司</th>
                  <th className="text-right" title="探针过滤后的真实干活时长">Agent 工时</th>
                  <th className="text-right" title="该公司人类的平均下班时间(揭榜日)">人走于</th>
                  <th className="text-right" title="人类下班后 Agent 继续干的时长">Agent 加班</th>
                  <th className="text-right" title="会话数(DAA 累计)">会话</th>
                  <th className="text-right" title="Agent 工时 ÷ 人类工时">Leverage</th>
                  <th className="text-right">在岗</th>
                </tr>
              </thead>
              <tbody className="font-bold">
                {agentBoard.slice(0, 20).map((r, i) => (
                  <tr key={r.name} className="border-b border-dashed border-black/20">
                    <td className="py-2 font-black">{i + 1}</td>
                    <td>{r.name}</td>
                    <td className="text-right tabular-nums font-black">{r.active_hours}h</td>
                    <td className="text-right tabular-nums">
                      {r.human_avg_minutes != null ? fmtMinutes(r.human_avg_minutes) : <span className="opacity-30">—</span>}
                    </td>
                    <td className="text-right tabular-nums">{r.overtime_hours}h</td>
                    <td className="text-right tabular-nums">{r.sessions}</td>
                    <td className="text-right tabular-nums">{r.leverage ?? "—"}</td>
                    <td className="text-right">
                      {r.live_now > 0 ? (
                        <span className="bg-[var(--nb-green)] px-2 py-0.5 text-xs font-black">⚡{r.live_now}</span>
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
            「人走于 18:05 · Agent 加班到深夜」—— 公司越 AI-native,人走得越早
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
              <h2 className="text-xl font-black">{tag ? `${tag.value} · ` : "全国 · "}早下班英雄榜</h2>
              <span className="text-xs font-bold opacity-60">{humanBoard?.day} 榜 · 每天 10:00 揭榜</span>
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
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                {[
                  { label: "今日实时", v: humanBoard.stats.today_avg },
                  { label: "昨日平均", v: humanBoard.stats.day_avg },
                  { label: "一周平均", v: humanBoard.stats.week_avg },
                ].map((s) => (
                  <div key={s.label} className="nb-card bg-white p-3">
                    <div className="text-xl font-black tabular-nums">{fmtMinutes(s.v)}</div>
                    <div className="text-xs font-bold opacity-60">{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-center text-xs font-bold opacity-50">
              共 {humanBoard?.company_count ?? "—"} 家公司上榜 · 只公布前三,绝不挂人 · 第 4 名开始只私信本人
            </p>
          </section>
        </>
      )}
    </main>
  );
}

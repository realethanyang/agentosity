"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtMinutes } from "@/lib/time";

type Top3 = { rank: number; name: string; avg_minutes: number; count: number };
type Board = {
  day: string;
  top3: Top3[];
  company_count: number;
  stats: { today_avg: number | null; day_avg: number | null; week_avg: number | null };
};

const INDUSTRIES = ["互联网", "游戏", "AI", "硬件", "电商", "汽车", "内容", "消费"];
const CITIES = ["北京", "上海", "深圳", "杭州", "广州"];

type Pulse = {
  checked_out: number;
  still_working: number;
  companies_all_out: number;
  companies_total: number;
};

export default function Home() {
  const [board, setBoard] = useState<Board | null>(null);
  const [tag, setTag] = useState<{ type: string; value: string } | null>(null);
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [liveWorking, setLiveWorking] = useState<number>(0);
  const [pulse, setPulse] = useState<Pulse | null>(null);

  useEffect(() => {
    const q = tag ? `?tag_type=${tag.type}&tag=${encodeURIComponent(tag.value)}` : "";
    fetch(`/api/board${q}`).then((r) => r.json()).then(setBoard);
  }, [tag]);

  useEffect(() => {
    fetch("/api/agents").then((r) => r.json()).then((d) => {
      setLiveTotal(d?.live?.total ?? null);
      setLiveWorking(d?.live?.working ?? 0);
    });
    fetch("/api/pulse").then((r) => r.json()).then(setPulse).catch(() => {});
  }, []);

  const medals = ["🥇", "🥈", "🥉"];
  const podiumBg = ["var(--nb-yellow)", "#e8e8e8", "var(--nb-orange)"];

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      {/* Hero */}
      <section className="pt-10 pb-6">
        <h1 className="text-4xl font-black leading-tight sm:text-5xl">
          谁家下班早,
          <br />
          全国都知道。
        </h1>
        <p className="mt-3 font-bold opacity-70">
          全国上班族共同维护的真实下班时间数据库 · 只公布前三,绝不挂人
        </p>
        {/* 实时脉搏:打卡前就该看到的即时反馈 */}
        <div className="mt-4 flex flex-wrap gap-2">
          {pulse && (
            <span className="nb-card inline-block bg-[var(--nb-green)] px-3 py-2 text-sm font-bold">
              🏃 今天已有 {pulse.checked_out} 人下班
              {pulse.still_working > 0 && ` · ${pulse.still_working} 人还在岗`}
              {pulse.companies_all_out > 0 && ` · ${pulse.companies_all_out} 家公司全员撤离`}
            </span>
          )}
          {liveTotal != null && liveTotal > 0 && (
            <Link href="/agents" className="inline-block">
              <span className="nb-card inline-block bg-[var(--nb-ink)] px-3 py-2 text-sm font-bold text-white">
                🤖 {liveTotal} 个 Agent 在上班({liveWorking} 个在干活)→
              </span>
            </Link>
          )}
        </div>
      </section>

      {/* 标签筛选 */}
      <section className="flex flex-wrap gap-2 pb-6 text-sm font-extrabold">
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

      {/* 揭榜 */}
      <section className="nb-card bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <h2 className="text-xl font-black sm:text-2xl">
            {tag ? `${tag.value} · ` : "全国 · "}早下班英雄榜
          </h2>
          <span className="text-xs font-bold opacity-60">{board?.day} 榜</span>
        </div>

        {!board ? (
          <p className="py-10 text-center font-bold opacity-50">揭榜中…</p>
        ) : board.top3.length === 0 ? (
          <p className="py-10 text-center font-bold opacity-50">
            这个榜还空着——第一个打卡的人就是榜一。
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {board.top3.map((t, i) => (
              <div key={t.rank} className="nb-card p-4 text-center"
                style={{ background: podiumBg[i] }}>
                <div className="text-3xl">{medals[i]}</div>
                <div className="mt-1 truncate text-lg font-black">{t.name}</div>
                <div className="text-3xl font-black tabular-nums">{fmtMinutes(t.avg_minutes)}</div>
                <div className="mt-1 text-xs font-bold opacity-60">
                  平均下班 · {t.count} 人打卡
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 三数卡片 */}
        {board && (
          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            {[
              { label: "今日实时", v: board.stats.today_avg },
              { label: "昨日平均", v: board.stats.day_avg },
              { label: "一周平均", v: board.stats.week_avg },
            ].map((s) => (
              <div key={s.label} className="nb-card bg-white p-3">
                <div className="text-xl font-black tabular-nums">{fmtMinutes(s.v)}</div>
                <div className="text-xs font-bold opacity-60">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-3 text-center text-xs font-bold opacity-50">
          共 {board?.company_count ?? "—"} 家公司上榜 · 每天 10:00 揭榜 · 第 4 名开始只私信本人
        </p>
      </section>

      {/* CTA */}
      <section className="mt-8 text-center">
        <Link href="/checkin"
          className="nb-btn inline-block bg-[var(--nb-pink)] px-10 py-4 text-2xl font-black text-white">
          我下班了,打卡 →
        </Link>
        <p className="mt-3 text-xs font-bold opacity-50">
          匿名打卡,无需注册 · 明早 10:00 私信你公司排名
        </p>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtMinutes } from "@/lib/time";
import { deviceId } from "@/lib/device";
import { freshAuthHeaders } from "@/lib/auth-client";

type Live = {
  total: number;
  working: number;
  idle: number;
  today_active_hours?: number;
};
type AgentRow = {
  name: string;
  active_hours: number;
  human_avg_minutes: number | null;
  live_now: number;
};
type Top3 = { rank: number; name: string; avg_minutes: number; count: number };
type Pulse = {
  checked_out: number;
  still_working: number;
  companies_all_out: number;
};
type MyAgents = { sessions: number; active_hours: number; live_now: number };
type MyToday = { checked_in: boolean; clocked_local?: string };
type RankPos = { rank: number; total: number } | null;
type MyCompany = {
  company: { id: string; name: string } | null;
  pulse?: { checked_out: number; roster: number; working: number; idle: number; active_hours_today: number };
  ranks?: {
    agent_overall: RankPos;
    agent_by_industry: { tag: string; rank: number; total: number }[];
    agent_by_city: { tag: string; rank: number; total: number }[];
    human_overall: RankPos;
  };
};

export default function Home() {
  const [live, setLive] = useState<Live | null>(null);
  const [board, setBoard] = useState<AgentRow[] | null>(null);
  const [humanTop, setHumanTop] = useState<Top3[] | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [my, setMy] = useState<MyAgents | null>(null);
  const [myToday, setMyToday] = useState<MyToday | null>(null);
  const [myCompany, setMyCompany] = useState<MyCompany | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const load = async () => {
      fetch("/api/agents").then((r) => r.json()).then((d) => {
        setLive(d.live);
        setBoard(d.board);
      });
      fetch("/api/board").then((r) => r.json()).then((d) => setHumanTop(d.top3));
      fetch("/api/pulse").then((r) => r.json()).then(setPulse);

      const headers = await freshAuthHeaders();
      if (headers.Authorization) {
        setLoggedIn(true);
        const q = `?device=${deviceId()}`;
        fetch(`/api/my-agents${q}`, { headers }).then((r) => r.json()).then(setMy);
        fetch(`/api/my-today${q}`, { headers }).then((r) => r.json()).then(setMyToday);
        fetch(`/api/my-company${q}`, { headers }).then((r) => r.json()).then(setMyCompany);
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      {/* ===== 外环 · 全网实况 ===== */}
      <section className="pt-8">
        <div className="text-xs font-black tracking-widest opacity-50">
          AI 时代的考勤系统 · 此刻
        </div>
        <h1 className="mt-2 text-5xl font-black leading-tight tabular-nums sm:text-6xl">
          <span className="live-dot mr-2" aria-hidden />
          ⚡ {live?.working ?? "—"}
          <span className="text-2xl font-black opacity-60"> 个 Agent 正在干活</span>
        </h1>
        <p className="mt-2 text-sm font-bold opacity-60 tabular-nums">
          全网在岗 {live?.total ?? "—"}(😴 {live?.idle ?? "—"} 挂机)· 今日已产出{" "}
          <span className="text-[var(--nb-ink)] opacity-100">{live?.today_active_hours ?? "—"}</span> agent-hours
        </p>

        {/* 灵魂对照条 */}
        {pulse && (
          <div className="nb-card mt-4 bg-[var(--nb-green)] px-4 py-3 text-sm font-bold">
            🏃 今天已有 <span className="text-lg font-black tabular-nums">{pulse.checked_out}</span> 位人类下班
            {live != null && live.total > 0 && (
              <> · 他们的 Agent 还有 <span className="text-lg font-black tabular-nums">{live.total}</span> 个在岗</>
            )}
            {pulse.companies_all_out > 0 && <> · {pulse.companies_all_out} 家公司全员撤离</>}
          </div>
        )}
      </section>

      {/* ===== 内环 · 我 / 中环 · 我的公司 ===== */}
      {loggedIn ? (
        <section className="mt-6 grid gap-3 sm:grid-cols-2">
          {/* 内环:我 */}
          <div className="nb-card bg-[var(--nb-yellow)] p-4">
            <div className="text-xs font-black opacity-60">我的 Agent</div>
            <div className="mt-1 text-3xl font-black tabular-nums">
              {my?.active_hours ?? 0}
              <span className="text-base"> 小时</span>
            </div>
            <div className="mt-1 text-xs font-bold opacity-70">
              今天干的活 · 此刻 {my?.live_now ?? 0} 个在跑
            </div>
            <div className="mt-3 border-t-2 border-dashed border-black/30 pt-2 text-sm font-bold">
              {myToday?.checked_in ? (
                <>✅ 我 {myToday.clocked_local} 已下班,Agent 还在干</>
              ) : (
                <Link href="/me" className="underline">我还没打卡 · 去下班 →</Link>
              )}
            </div>
          </div>

          {/* 中环:我的公司 */}
          <div className="nb-card bg-white p-4">
            <div className="text-xs font-black opacity-60">
              🏢 {myCompany?.company?.name ?? "我的公司"}
            </div>
            {myCompany?.pulse ? (
              <>
                <div className="mt-1 text-sm font-bold tabular-nums">
                  同事:今天 {myCompany.pulse.checked_out}/{myCompany.pulse.roster} 人已下班
                </div>
                <div className="text-sm font-bold tabular-nums">
                  Agent:⚡{myCompany.pulse.working} 干活 · 😴{myCompany.pulse.idle} 挂机 · 今日 {myCompany.pulse.active_hours_today}h
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-[11px] font-black">
                  {myCompany.ranks?.agent_overall && (
                    <span className="border-2 border-black bg-[var(--nb-blue)] px-1.5 py-0.5 text-white">
                      Agent 榜 全国 #{myCompany.ranks.agent_overall.rank}/{myCompany.ranks.agent_overall.total}
                    </span>
                  )}
                  {myCompany.ranks?.agent_by_industry?.map((r) => (
                    <span key={r.tag} className="border-2 border-black bg-white px-1.5 py-0.5">
                      {r.tag} #{r.rank}/{r.total}
                    </span>
                  ))}
                  {myCompany.ranks?.agent_by_city?.map((r) => (
                    <span key={r.tag} className="border-2 border-black bg-white px-1.5 py-0.5">
                      {r.tag} #{r.rank}/{r.total}
                    </span>
                  ))}
                  {myCompany.ranks?.human_overall && (
                    <span className="border-2 border-black bg-[var(--nb-green)] px-1.5 py-0.5">
                      早下班榜 #{myCompany.ranks.human_overall.rank}/{myCompany.ranks.human_overall.total}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <p className="mt-2 text-sm font-bold opacity-60">
                <Link href="/me" className="underline">绑定公司</Link> 后,看你全公司的实时下班与 Agent 动态
              </p>
            )}
          </div>
        </section>
      ) : (
        <section className="nb-card mt-6 flex flex-wrap items-center justify-between gap-3 bg-white p-4">
          <p className="text-sm font-bold">
            登录后解锁<span className="font-black">你的 Agent 战报</span>和
            <span className="font-black">你全公司的实时视角</span> —— 谁下班了、谁的 Agent 在干活,尽在掌握。
          </p>
          <Link href="/login" className="nb-btn bg-[var(--nb-pink)] px-5 py-2 font-black text-white">
            登录 →
          </Link>
        </section>
      )}

      {/* ===== 外环 · 双榜预览 ===== */}
      <section className="nb-card mt-6 bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-black">Agent 加班榜</h2>
          <Link href="/leaderboard" className="text-xs font-bold underline opacity-60">完整榜单 →</Link>
        </div>
        {board && (
          <table className="mt-3 w-full text-sm">
            <tbody className="font-bold">
              {board.slice(0, 5).map((r, i) => (
                <tr key={r.name} className="border-b border-dashed border-black/15">
                  <td className="py-1.5 font-black">{i + 1}</td>
                  <td>{r.name}</td>
                  <td className="text-right tabular-nums font-black">{r.active_hours}h</td>
                  <td className="text-right text-xs tabular-nums opacity-60">
                    {r.human_avg_minutes != null ? `人走 ${fmtMinutes(r.human_avg_minutes)}` : ""}
                  </td>
                  <td className="w-10 text-right text-xs">{r.live_now > 0 ? `⚡${r.live_now}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="nb-card mt-4 bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-black">早下班英雄榜</h2>
          <Link href="/leaderboard?tab=human" className="text-xs font-bold underline opacity-60">完整榜单 →</Link>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {(humanTop ?? []).map((t, i) => (
            <div key={t.rank} className="nb-card p-2"
              style={{ background: ["var(--nb-yellow)", "#e8e8e8", "var(--nb-orange)"][i] }}>
              <div className="text-lg">{["🥇", "🥈", "🥉"][i]}</div>
              <div className="truncate text-sm font-black">{t.name}</div>
              <div className="text-lg font-black tabular-nums">{fmtMinutes(t.avg_minutes)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* 接入 CTA */}
      <section className="mt-8 text-center">
        <Link href="/start" className="nb-btn inline-block bg-[var(--nb-ink)] px-8 py-4 text-xl font-black text-white">
          接入你的 Agent 考勤 →
        </Link>
        <p className="mt-2 text-xs font-bold opacity-50">
          mac 一个 App / 其他平台一条命令 · 只报时长,不读内容,开源可审计
        </p>
      </section>
    </main>
  );
}

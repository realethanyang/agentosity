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
import AgentBoardTable, { AgentBoardRow } from "@/components/AgentBoardTable";

type Top3 ={ rank: number; name: string; avg_minutes: number; count: number };
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
  const [board, setBoard] = useState<AgentBoardRow[] | null>(null);
  const [humanTop, setHumanTop] = useState<Top3[] | null>(null);
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [my, setMy] = useState<MyAgents | null>(null);
  const [myToday, setMyToday] = useState<MyToday | null>(null);
  const [myCompany, setMyCompany] = useState<MyCompany | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const load = async () => {
      fetch("/api/agents?days=1").then((r) => r.json()).then((d) => {
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
          全网 · 此刻 <span className="live-dot ml-1 align-middle" style={{ width: 10, height: 10 }} aria-hidden />
        </div>
        {/* 主视觉:我们定义的单位 agent-hours */}
        <h1 className="mt-2 font-black leading-none tabular-nums">
          <span className="text-6xl sm:text-7xl">{live?.today_active_hours ?? "—"}</span>
          <span className="ml-2 inline-block -translate-y-1 border-3 bg-[var(--nb-yellow)] px-2 py-0.5 text-xl font-black"
            style={{ border: "3px solid var(--nb-ink)", boxShadow: "3px 3px 0 0 var(--nb-ink)" }}>
            agent-hours
          </span>
        </h1>
        <p className="mt-1 text-sm font-bold opacity-60">今日全网 Agent 已干活的总时长</p>
        <p className="mt-3 text-lg font-black tabular-nums">
          ⚡ {live?.working ?? "—"}<span className="opacity-50">/{live?.total ?? "—"}</span> 个在岗 Agent 正在干活
        </p>

        {/* 灵魂对照条 */}
        {pulse && (
          <div className="nb-card mt-4 bg-[var(--nb-green)] px-4 py-3 text-sm font-bold">
            🏃 全网{" "}
            <span className="text-lg font-black tabular-nums">
              {pulse.checked_out}/{pulse.checked_out + pulse.still_working}
            </span>{" "}
            位用户已下班
            {live != null && live.working > 0 && (
              <> · ⚡ <span className="text-lg font-black tabular-nums">{live.working}</span> 个 Agent 还在替他们干活</>
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
                  真人:今天 {myCompany.pulse.checked_out}/{myCompany.pulse.roster} 人已下班
                </div>
                <div className="text-sm font-bold tabular-nums">
                  Agent:⚡ {myCompany.pulse.working}/{myCompany.pulse.working + myCompany.pulse.idle} 个正在工作
                  · 今日 {myCompany.pulse.active_hours_today} agent-hours
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
      <section className="nb-card mt-6 overflow-x-auto bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-black">Agent 工时榜<span className="ml-1 text-xs font-bold opacity-50">今日 · 实时</span></h2>
          <Link href="/leaderboard" className="text-xs font-bold underline opacity-60">7/30 天与指数排序 →</Link>
        </div>
        {board && <AgentBoardTable rows={board} limit={10} />}
      </section>

      <section className="nb-card mt-4 bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-black">早下班榜<span className="ml-1 text-xs font-bold opacity-50">今日实时</span></h2>
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

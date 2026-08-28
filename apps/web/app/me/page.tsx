"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { deviceId } from "@/lib/device";
import { fmtMinutes } from "@/lib/time";
import { freshAuthHeaders, authState, clearAuth } from "@/lib/auth-client";

type Company = { id: string; name: string };
type Profile = { company: Company | null; can_change: boolean; next_change_at: string | null };
type MyRank = {
  found: boolean;
  no_data?: boolean;
  day?: string;
  company?: string;
  rank?: number;
  total?: number;
  avg_minutes?: number;
  checkin_count?: number;
  gap_to_top3?: number;
};
type MyAgents = { sessions: number; active_hours: number; session_hours: number; live_now: number };
type MyToday = { checked_in: boolean; clocked_local?: string };

export default function MePage() {
  const [needLogin, setNeedLogin] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [rank, setRank] = useState<MyRank | null>(null);
  const [myAgents, setMyAgents] = useState<MyAgents | null>(null);
  const [today, setToday] = useState<MyToday | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ time: string; rankCompany: number | null; rankGlobal: number | null } | null>(null);
  const [showBackfill, setShowBackfill] = useState(false);
  const [bfDate, setBfDate] = useState("");
  const [bfTime, setBfTime] = useState("19:00");
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = async () => {
    const headers = await freshAuthHeaders();
    if (!headers.Authorization) {
      setNeedLogin(true);
      return;
    }
    setEmail(authState()?.email ?? null);
    const dq = `?device=${deviceId()}`;
    fetch(`/api/profile${dq}`, { headers }).then((r) => r.json()).then(setProfile);
    fetch(`/api/me${dq}`, { headers }).then((r) => r.json()).then(setRank);
    fetch(`/api/my-agents${dq}`, { headers }).then((r) => r.json()).then(setMyAgents);
    fetch(`/api/my-today${dq}`, { headers }).then((r) => r.json()).then(setToday);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!q.trim()) return setResults([]);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const r = await fetch(`/api/companies?q=${encodeURIComponent(q)}`);
      setResults(await r.json());
    }, 250);
  }, [q]);

  async function bindCompany(c: Company) {
    setError(null);
    const headers = await freshAuthHeaders();
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ companyId: c.id, deviceId: deviceId() }),
    });
    const d = await r.json();
    if (r.ok) {
      setQ("");
      setResults([]);
      setPicking(false);
      load();
    } else setError(d.error ?? "绑定失败");
  }

  async function createCompany() {
    const r = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: q.trim() }),
    });
    const d = await r.json();
    if (d.id) bindCompany(d);
    else setError(d.error ?? "创建失败");
  }

  async function punch(backfill?: { date: string; time: string }) {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await freshAuthHeaders()) },
      body: JSON.stringify({ deviceId: deviceId(), backfill }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.ok) {
      setDone({ time: d.clocked_local, rankCompany: d.rank_company, rankGlobal: d.rank_global });
      load();
    } else setError(d.error ?? "打卡失败");
  }

  if (needLogin) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="nb-card bg-white p-8">
          <p className="text-lg font-black">登录后进入你的主页</p>
          <p className="mt-2 text-sm font-bold opacity-60">打卡、排名、Agent 战报、公司绑定,都在这。</p>
          <Link href="/login?next=/me" className="nb-btn mt-4 inline-block bg-[var(--nb-pink)] px-8 py-3 font-black text-white">
            登录 →
          </Link>
        </div>
      </main>
    );
  }

  const company = profile?.company ?? null;

  return (
    <main className="mx-auto max-w-xl px-4 pb-16 pt-8">
      <h1 className="text-3xl font-black">我的</h1>

      {/* 打卡区 */}
      <section className="nb-card mt-5 bg-white p-5">
        {done ? (
          <div className="text-center">
            <div className="text-4xl">✅</div>
            <p className="mt-1 text-xl font-black">下班快乐!{done.time.slice(-5)}</p>
            {done.rankCompany != null && (
              <p className="mt-1 text-sm font-bold">
                你是{company ? `「${company.name}」` : ""}今天第 {done.rankCompany} 个下班的
                {done.rankGlobal != null && done.rankGlobal !== done.rankCompany ? ` · 全网第 ${done.rankGlobal}` : ""}
              </p>
            )}
            <button onClick={() => setDone(null)} className="mt-2 text-xs font-bold underline opacity-60">好</button>
          </div>
        ) : today?.checked_in ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-black">✅ 今天 {today.clocked_local} 已打卡</p>
            <button onClick={() => punch()} disabled={busy} className="nb-btn bg-white px-3 py-1 text-sm font-bold">
              改成现在 🔁
            </button>
          </div>
        ) : (
          <button onClick={() => punch()} disabled={busy || !company}
            className="nb-btn w-full bg-[var(--nb-pink)] py-5 text-2xl font-black text-white disabled:opacity-40">
            {busy ? "打卡中…" : company ? "我下班了 🎉" : "先绑定公司(下方)"}
          </button>
        )}
        <button onClick={() => setShowBackfill(!showBackfill)} className="mt-3 text-xs font-extrabold underline opacity-60">
          {showBackfill ? "收起补卡" : "忘打卡?补卡 →"}
        </button>
        {showBackfill && (
          <div className="mt-2 flex flex-wrap items-end gap-3 text-sm font-bold">
            <label>日期 <input type="date" value={bfDate} onChange={(e) => setBfDate(e.target.value)}
              className="p-2" style={{ border: "3px solid var(--nb-ink)" }} /></label>
            <label>那天几点下班 <input type="time" value={bfTime} onChange={(e) => setBfTime(e.target.value)}
              className="p-2" style={{ border: "3px solid var(--nb-ink)" }} /></label>
            <button disabled={!bfDate || busy} onClick={() => punch({ date: bfDate, time: bfTime })}
              className="nb-btn bg-[var(--nb-blue)] px-4 py-2 font-black text-white disabled:opacity-40">补卡</button>
          </div>
        )}
      </section>

      {/* 我的排名(私密) */}
      <section className="nb-card mt-4 p-5"
        style={{ background: rank?.found && !rank.no_data && (rank.rank ?? 99) <= 3 ? "var(--nb-yellow)" : "white" }}>
        <div className="text-xs font-black opacity-60">我的公司排名(只有你看得到)</div>
        {!rank ? (
          <p className="mt-2 font-bold opacity-50">查询中…</p>
        ) : !rank.found || rank.no_data ? (
          <p className="mt-2 text-sm font-bold opacity-60">揭榜日还没有你公司的有效打卡。拉上同事一起,1 个人也能上榜。</p>
        ) : (
          <div className="mt-1 flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-black tabular-nums">#{rank.rank}<span className="text-lg opacity-50">/{rank.total}</span></span>
            <span className="font-bold">{rank.day} · 平均 {fmtMinutes(rank.avg_minutes)} · {rank.checkin_count} 人打卡</span>
            {(rank.rank ?? 99) <= 3 ? (
              <span className="font-black">🏆 在榜上!</span>
            ) : (
              <span className="font-bold">离前三差 <span className="font-black text-[var(--nb-pink)]">{rank.gap_to_top3} 分钟</span></span>
            )}
          </div>
        )}
      </section>

      {/* 我的 Agent 战报 */}
      <section className="nb-card mt-4 bg-[var(--nb-yellow)] p-5">
        <div className="text-xs font-black opacity-60">我的 Agent 今日战报</div>
        {myAgents && myAgents.sessions > 0 ? (
          <p className="mt-1 font-bold tabular-nums">
            ⚡ 干活 <span className="text-2xl font-black">{myAgents.active_hours}h</span> · 会话 {myAgents.sessions} 个 · 在岗 {myAgents.session_hours}h · 此刻 {myAgents.live_now} 个在跑
          </p>
        ) : (
          <p className="mt-1 text-sm font-bold opacity-70">
            还没有 Agent 数据 —— <Link href="/start" className="underline">接入考勤 →</Link>
          </p>
        )}
      </section>

      {/* 公司绑定 */}
      <section className="nb-card mt-4 bg-white p-5">
        <div className="text-xs font-black opacity-60">公司绑定(改绑每周一次)</div>
        {company && !picking ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xl font-black">🏢 {company.name}</span>
            {profile?.can_change ? (
              <button onClick={() => setPicking(true)} className="nb-btn bg-white px-3 py-1 text-sm font-bold">换一家</button>
            ) : (
              <span className="text-xs font-bold opacity-50">下次可改:{profile?.next_change_at}</span>
            )}
          </div>
        ) : (
          <div className="mt-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索公司名…"
              className="w-full p-3 font-bold outline-none" style={{ border: "3px solid var(--nb-ink)" }} />
            {picking && (
              <button onClick={() => setPicking(false)} className="mt-1 text-xs font-bold underline opacity-60">取消</button>
            )}
            {q.trim() && (
              <div className="mt-1">
                {results.map((c) => (
                  <button key={c.id} onClick={() => bindCompany(c)}
                    className="block w-full border-b-2 border-dashed border-black/20 p-2 text-left font-bold hover:bg-[var(--nb-yellow)]">
                    {c.name}
                  </button>
                ))}
                <button onClick={createCompany} className="mt-1 block w-full p-2 text-left text-sm font-bold text-[var(--nb-blue)]">
                  ＋ 没找到?创建「{q.trim()}」
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 账号 */}
      <section className="mt-4 flex items-center justify-between text-xs font-bold opacity-60">
        <span>✓ {email}</span>
        <button onClick={() => { clearAuth(); location.reload(); }} className="underline">退出登录</button>
      </section>

      {error && <p className="mt-4 text-center font-bold text-red-600">{error}</p>}
    </main>
  );
}

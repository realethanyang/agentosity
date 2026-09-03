"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fmtMinutes, shanghaiNow } from "@/lib/time";
import { deviceId } from "@/lib/device";
import { freshAuthHeaders } from "@/lib/auth-client";

type Live = {
  total: number;
  working: number;
  idle: number;
  today_active_hours?: number;
};
import AgentBoardTable, { AgentBoardRow } from "@/components/AgentBoardTable";
import ShareCardButton from "@/components/ShareCard";

type Top3 = { rank: number; name: string; avg_minutes: number; count: number };
type Trend = { trend: { day: string; hours: number }[]; total_hours: number };
type HumanBoard = {
  day: string;
  top3: Top3[];
  stats: { today_avg: number | null; day_avg: number | null; week_avg: number | null };
};
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

/**
 * 监控大屏式数字:30s 轮询之间按「working 个 Agent 每秒累积 working/3600 小时」持续爬升,
 * 新数据到达时平滑滚动校正 —— 动态感是真的(在干活的 Agent 确实在实时累积工时)。
 */
function useTickerHours(target: number | null | undefined, workingNow: number): number | null {
  const [disp, setDisp] = useState<number | null>(null);
  const dispRef = useRef<number | null>(null);
  const targetRef = useRef(0);
  const rateRef = useRef(0);

  useEffect(() => {
    if (target == null) return;
    targetRef.current = target;
    if (dispRef.current == null) {
      dispRef.current = target;
      setDisp(target);
    }
  }, [target]);
  useEffect(() => {
    rateRef.current = workingNow / 3600; // 小时/秒
  }, [workingNow]);
  useEffect(() => {
    const iv = setInterval(() => {
      if (dispRef.current == null) return;
      targetRef.current += rateRef.current * 0.25;
      let d = dispRef.current + (targetRef.current - dispRef.current) * 0.08;
      if (Math.abs(targetRef.current - d) < 0.0005) d = targetRef.current;
      dispRef.current = d;
      setDisp(d);
    }, 250);
    return () => clearInterval(iv);
  }, []);
  return disp;
}

export default function Home() {
  const [live, setLive] = useState<Live | null>(null);
  const [board, setBoard] = useState<AgentBoardRow[] | null>(null);
  const [humanBoard, setHumanBoard] = useState<HumanBoard | null>(null);
  const [punchBusy, setPunchBusy] = useState(false);
  const [punchDone, setPunchDone] = useState<{ time: string; rankGlobal: number | null } | null>(null);
  const [punchErr, setPunchErr] = useState<string | null>(null);
  const [cmdCopied, setCmdCopied] = useState(false);
  const tickerHours = useTickerHours(live?.today_active_hours, live?.working ?? 0);
  const [trend, setTrend] = useState<Trend | null>(null);
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
      fetch("/api/board").then((r) => r.json()).then(setHumanBoard);
      fetch("/api/trend").then((r) => r.json()).then(setTrend).catch(() => {});
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
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  /** 首页一键打卡:成功后就地刷新脉搏与人类榜 */
  async function punch() {
    setPunchBusy(true);
    setPunchErr(null);
    const r = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await freshAuthHeaders()) },
      body: JSON.stringify({ deviceId: deviceId() }),
    });
    const d = await r.json();
    setPunchBusy(false);
    if (d.ok) {
      setPunchDone({ time: d.clocked_local, rankGlobal: d.rank_global });
      setMyToday({ checked_in: true, clocked_local: d.clocked_local });
      fetch("/api/pulse").then((res) => res.json()).then(setPulse).catch(() => {});
      fetch("/api/board").then((res) => res.json()).then(setHumanBoard).catch(() => {});
    } else setPunchErr(d.error ?? "打卡失败,再试一次");
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pb-16">
      {/* ===== 外环 · 全网实况 ===== */}
      <section className="pt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-black tracking-widest opacity-50">
            全网 · 此刻 <span className="live-dot ml-1 align-middle" style={{ width: 10, height: 10 }} aria-hidden />
          </div>
          <div className="text-2xl font-black italic sm:text-3xl">
            AI-native? <span className="inline-block -rotate-2 bg-[var(--nb-ink)] px-2 py-0.5 text-[var(--nb-yellow)]"
              style={{ boxShadow: "3px 3px 0 0 rgba(17,17,17,0.35)" }}>Prove it!</span>
          </div>
        </div>
        {/* 主视觉:我们定义的单位 agent-hours(监控大屏式实时爬升) */}
        <h1 className="mt-2 font-black leading-none tabular-nums">
          <span className="text-6xl sm:text-7xl">
            {tickerHours != null ? (
              <>
                {tickerHours.toFixed(2).slice(0, -1)}
                <span className="text-4xl opacity-60 sm:text-5xl">{tickerHours.toFixed(2).slice(-1)}</span>
              </>
            ) : "—"}
          </span>
          <span className="ml-2 inline-block -translate-y-1 border-3 bg-[var(--nb-yellow)] px-2 py-0.5 text-xl font-black"
            style={{ border: "3px solid var(--nb-ink)", boxShadow: "3px 3px 0 0 var(--nb-ink)" }}>
            agent-hours
          </span>
        </h1>
        <p className="mt-1 text-sm font-bold opacity-60">
          {new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "long", day: "numeric", weekday: "short" }).format(new Date())}
          {" "}· 全网入驻用户的 Agent 今天实打实干活的总时长(挂机不算)
        </p>
        <p className="mt-3 text-lg font-black tabular-nums">
          ⚡ {live?.working ?? "—"}<span className="opacity-50">/{live?.total ?? "—"}</span> 个在岗 Agent 正在干活
        </p>

        {/* 增长感:一行字 + 微型火花线,不占版面(完整逐日图在榜单页) */}
        {trend && trend.trend.length > 1 && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-bold opacity-70 tabular-nums">
            <span>
              昨日全站 {trend.trend[trend.trend.length - 2]?.hours}h · 历史累计{" "}
              <span className="font-black">{trend.total_hours}h</span>
            </span>
            <Link href="/leaderboard" title="看逐日趋势" className="inline-flex items-end gap-[2px]" style={{ height: 14 }}>
              {trend.trend.map((d, i) => {
                const max = Math.max(...trend.trend.map((x) => x.hours), 1);
                const last = i === trend.trend.length - 1;
                return (
                  <span key={d.day} className={last ? "bg-[var(--nb-yellow)]" : "bg-[var(--nb-ink)]"}
                    style={{ width: 4, height: `${Math.max(15, (d.hours / max) * 100)}%`, outline: last ? "1px solid var(--nb-ink)" : undefined }} />
                );
              })}
            </Link>
          </p>
        )}

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
            {my && my.sessions > 0 && (
              <ShareCardButton hours={my.active_hours} liveNow={my.live_now} />
            )}
            <div className="mt-3 border-t-2 border-dashed border-black/30 pt-2 text-sm font-bold">
              {myToday?.checked_in ? (
                <>✅ 我 {myToday.clocked_local} 已下班,Agent 还在干</>
              ) : (
                <a href="#human-board" className="underline">我还没打卡 · 一键打卡在下方 ↓</a>
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
        <section className="nb-card mt-6 bg-white p-4">
          <p className="mb-3 text-base font-black">
            Agentosity 给你的 AI Agent 打考勤:它们实打实替你干了多少活,一个数字见分晓 —— 公司榜、个人榜,实时开赛。
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-black">⏱ 30 秒接入:</span>
            <code className="flex-1 overflow-x-auto whitespace-nowrap bg-[var(--nb-ink)] px-3 py-2 font-mono font-bold text-[var(--nb-yellow)]"
              style={{ minWidth: 220 }}>
              npx agentosity init
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText("npx agentosity init");
                setCmdCopied(true);
                setTimeout(() => setCmdCopied(false), 1500);
              }}
              className="nb-btn shrink-0 bg-[var(--nb-yellow)] px-4 py-2 font-black"
            >
              {cmdCopied ? "✅ 已复制" : "复制"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <a href="https://github.com/realethanyang/agentosity/releases/latest/download/Agentosity.dmg"
              className="nb-btn bg-white px-4 py-2 text-sm font-black">
              ⬇️ 不玩命令行?下载 mac App
            </a>
            <Link href="/login?next=/me" className="nb-btn bg-[var(--nb-pink)] px-4 py-2 text-sm font-black text-white">
              已有账号?登录 →
            </Link>
            <Link href="/start" className="text-xs font-bold underline opacity-60">详细说明 / 其他平台 →</Link>
          </div>
          <p className="mt-2 text-xs font-bold opacity-60">
            登录 → 自动配好个人旗号 → 自动接入全家 harness · 只报时长,不读内容,开源可审计
          </p>
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

      <section id="human-board" className="nb-card mt-4 bg-white p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-black">早下班榜<span className="ml-1 text-xs font-bold opacity-50">今日实时</span></h2>
          <Link href="/leaderboard?tab=human" className="text-xs font-bold underline opacity-60">行业/城市分榜 →</Link>
        </div>

        {/* 一键打卡 CTA:人类层唯一的手动动作,按时间分级出现 */}
        {loggedIn && (punchDone ? (
          <div className="nb-card mt-3 bg-[var(--nb-green)] p-3 text-center font-black">
            ✅ 下班快乐!{punchDone.time.slice(-5)}
            {punchDone.rankGlobal != null && ` · 你是全网今天第 ${punchDone.rankGlobal} 个下班的`}
          </div>
        ) : myToday?.checked_in ? null : shanghaiNow().hour >= 5 && shanghaiNow().hour < 12 ? null : !myCompany?.company ? (
          <Link href="/me" className="nb-btn mt-3 inline-block bg-white px-5 py-2 text-sm font-black">
            绑定公司后可一键打卡 →
          </Link>
        ) : shanghaiNow().hour >= 12 && shanghaiNow().hour < 17 ? (
          <button onClick={punch} disabled={punchBusy}
            className="nb-btn mt-3 bg-white px-5 py-2 font-black disabled:opacity-40">
            {punchBusy ? "打卡中…" : "我现在下班 🏃"}
          </button>
        ) : (
          <button onClick={punch} disabled={punchBusy}
            className="nb-btn mt-3 w-full bg-[var(--nb-pink)] py-4 text-2xl font-black text-white disabled:opacity-40">
            {punchBusy ? "打卡中…" : "我下班了 🎉"}
          </button>
        ))}
        {punchErr && <p className="mt-2 text-sm font-bold text-red-600">{punchErr}</p>}

        {!humanBoard || humanBoard.top3.length === 0 ? (
          <p className="mt-3 text-sm font-bold opacity-50">这个榜还空着 —— 今天第一个打卡的人就是榜一。</p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            {humanBoard.top3.map((t, i) => (
              <div key={t.rank} className="nb-card p-2"
                style={{ background: ["var(--nb-yellow)", "#e8e8e8", "var(--nb-orange)"][i] }}>
                <div className="text-lg">{["🥇", "🥈", "🥉"][i]}</div>
                <div className="truncate text-sm font-black">{t.name}</div>
                <div className="text-lg font-black tabular-nums">{fmtMinutes(t.avg_minutes)}</div>
                <div className="text-[10px] font-bold opacity-60">平均下班 · {t.count} 人</div>
              </div>
            ))}
          </div>
        )}

        {humanBoard && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            {[
              { label: "全网今日平均下班", v: humanBoard.stats.day_avg },
              { label: "全网近 7 天平均", v: humanBoard.stats.week_avg },
            ].map((s) => (
              <div key={s.label} className="nb-card bg-white p-2">
                <div className="text-lg font-black tabular-nums">{fmtMinutes(s.v)}</div>
                <div className="text-[10px] font-bold opacity-60">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 已登录:底部只留一个小入口(未登录用户的接入 CTA 在上面登录卡的位置) */}
      {loggedIn && (
        <p className="mt-8 text-center">
          <Link href="/start" className="nb-btn inline-block bg-white px-5 py-2 text-sm font-black">
            接入更多设备 / 详细说明 →
          </Link>
        </p>
      )}

      {/* 用户群:主页底部直接扫码,不用再点进去 */}
      <section className="mt-10 flex flex-col items-center gap-2 text-center">
        <Link href="/community" className="nb-card inline-block bg-white p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/wechat-group-qr.jpg" alt="Agentosity 微信用户群二维码" className="w-32" />
        </Link>
        <p className="text-xs font-bold opacity-60">微信扫码进用户群 · 吐槽 / 报 bug / 新功能抢先看</p>
      </section>
    </main>
  );
}

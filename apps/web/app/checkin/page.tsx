"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { deviceId } from "@/lib/device";
import { freshAuthHeaders } from "@/lib/auth-client";
import { shanghaiNow } from "@/lib/time";

import { suggestHandle } from "@/lib/handle";

type Company = { id: string; name: string };
type Profile = {
  company: Company | null;
  handle: string | null;
  can_change: boolean;
  next_change_at: string | null;
};

export default function CheckinPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [picking, setPicking] = useState(false);
  const company = profile?.company ?? null;
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [searching, setSearching] = useState(false);
  const [done, setDone] = useState<{
    time: string;
    note: string | null;
    rankCompany: number | null;
    rankGlobal: number | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBackfill, setShowBackfill] = useState(false);
  const [bfDate, setBfDate] = useState("");
  const [bfTime, setBfTime] = useState("19:00");
  const [error, setError] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);
  const [today, setToday] = useState<{ checked_in: boolean; clocked_local?: string; company?: string } | null>(null);
  const [pulse, setPulse] = useState<{ checked_out: number; still_working: number; companies_all_out: number } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const loadPulse = () =>
    fetch("/api/pulse").then((r) => r.json()).then(setPulse).catch(() => {});

  const loadProfile = async () => {
    const headers = await freshAuthHeaders();
    const r = await fetch(`/api/profile?device=${deviceId()}`, { headers });
    setProfile(await r.json());
  };

  useEffect(() => {
    freshAuthHeaders().then((headers) => {
      // 正式站统一登录
      if (process.env.NEXT_PUBLIC_REQUIRE_LOGIN === "1" && !headers.Authorization) {
        setNeedLogin(true);
        loadPulse();
        return;
      }
      loadProfile();
      fetch(`/api/my-today?device=${deviceId()}`, { headers })
        .then((r) => r.json())
        .then(setToday)
        .catch(() => {});
      loadPulse();
    });
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      setSearching(true);
      const r = await fetch(`/api/companies?q=${encodeURIComponent(q)}`);
      setResults(await r.json());
      setSearching(false);
    }, 250);
  }, [q]);

  async function createCompany() {
    const r = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: q.trim() }),
    });
    const d = await r.json();
    if (d.id) pick(d);
    else setError(d.error ?? "创建失败");
  }

  const [justBound, setJustBound] = useState(false);
  const [soloDone, setSoloDone] = useState(false);
  const fromCli = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("from") === "cli";

  const [handleInput, setHandleInput] = useState("");
  const [handleBusy, setHandleBusy] = useState(false);
  useEffect(() => {
    if (profile && !profile.handle && !handleInput) setHandleInput(suggestHandle());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function saveHandle() {
    const h = handleInput.trim();
    if (h.length < 2) return setError("旗号至少 2 个字符");
    setHandleBusy(true);
    setError(null);
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(await freshAuthHeaders()) },
      body: JSON.stringify({ handle: h, deviceId: deviceId() }),
    });
    const d = await r.json();
    setHandleBusy(false);
    if (r.ok) await loadProfile();
    else setError(d.error ?? "保存失败");
  }

  /** 跳过绑公司:用旗号建一人战队上榜(以后随时可改绑真公司,不占每周额度) */
  async function soloSkip() {
    setError(null);
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(await freshAuthHeaders()) },
      body: JSON.stringify({ solo: true, deviceId: deviceId() }),
    });
    const d = await r.json();
    if (r.ok) {
      setSoloDone(true);
      setJustBound(true);
      await loadProfile();
    } else setError(d.error ?? "操作失败");
  }

  /** 绑定/改绑公司(服务端唯一真相,改绑每周一次) */
  async function pick(c: Company) {
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
      setJustBound(true); // 绑定完成 → 给引导,别让用户愣在原地
      await loadProfile();
    } else {
      setError(d.error ?? "绑定失败");
    }
  }

  async function punch(backfill?: { date: string; time: string }) {
    if (!company) return;
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
      setDone({
        time: d.clocked_local,
        note: d.note,
        rankCompany: d.rank_company,
        rankGlobal: d.rank_global,
      });
      loadPulse();
    } else setError(d.error ?? "打卡失败,再试一次");
  }

  if (done) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="nb-card bg-[var(--nb-green)] p-8">
          <div className="text-5xl">✅</div>
          <h1 className="mt-3 text-3xl font-black">下班快乐!</h1>
          <p className="mt-2 text-lg font-bold">
            {company?.name} · {done.time}
          </p>
          {done.note && <p className="mt-2 text-sm font-bold opacity-70">{done.note}</p>}
          {done.rankCompany != null && (
            <p className="mt-3 text-sm font-bold">
              🏃 你是{company ? `「${company.name}」` : ""}今天第 {done.rankCompany} 个下班的
              {done.rankGlobal != null && done.rankGlobal !== done.rankCompany
                ? ` · 全网第 ${done.rankGlobal} 个`
                : ""}
              {pulse && pulse.still_working > 0 && `,还有 ${pulse.still_working} 人在岗`}
            </p>
          )}
          <p className="mt-4 text-sm font-bold opacity-70">
            榜单实时更新,看你公司排第几 →{" "}
            <Link href="/me" className="underline">我的排名</Link>
          </p>
        </div>
        <button onClick={() => setDone(null)} className="nb-btn mt-6 bg-white px-4 py-2 font-bold">
          返回
        </button>
      </main>
    );
  }

  if (needLogin) {
    return (
      <main className="mx-auto max-w-xl px-4 py-10">
        <h1 className="text-3xl font-black">下班打卡</h1>
        {pulse && (
          <p className="mt-2 text-sm font-bold opacity-70">
            🏃 今天已有 {pulse.checked_out} 人下班
            {pulse.still_working > 0 && ` · ${pulse.still_working} 人还在岗`}
          </p>
        )}
        <div className="nb-card mt-6 bg-white p-8 text-center">
          <p className="text-lg font-black">登录后开始打卡</p>
          <p className="mt-2 text-sm font-bold opacity-60">
            免密码,邮箱验证码 30 秒搞定。你的打卡和 Agent 数据会跟着账号走,换设备不丢。
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(fromCli ? "/checkin?from=cli" : "/checkin")}`}
            className="nb-btn mt-4 inline-block bg-[var(--nb-pink)] px-8 py-3 font-black text-white"
          >
            登录 →
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-black">下班打卡</h1>
      {pulse && (
        <p className="mt-2 text-sm font-bold opacity-70">
          🏃 今天已有 {pulse.checked_out} 人下班
          {pulse.still_working > 0 && ` · ${pulse.still_working} 人还在岗`}
          {pulse.companies_all_out > 0 && ` · ${pulse.companies_all_out} 家公司全员撤离`}
        </p>
      )}
      {today?.checked_in && (
        <div className="nb-card mt-4 bg-[var(--nb-green)] p-3 text-sm font-bold">
          ✅ 今天已打卡 {today.clocked_local}
          {today.company ? ` · ${today.company}` : ""} —— 再打以最后一次为准
        </div>
      )}

      {/* ① 个人旗号:个人榜门票,先让每个人零门槛上榜 */}
      <section className="mt-6">
        {profile && !profile.handle ? (
          <div className="nb-card bg-[var(--nb-yellow)] p-4">
            <label className="text-sm font-extrabold">🚩 立个人旗号 —— 你在个人榜上的名字,想叫啥叫啥</label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input value={handleInput} onChange={(e) => setHandleInput(e.target.value)}
                className="flex-1 bg-white p-3 font-bold outline-none" style={{ border: "3px solid var(--nb-ink)", minWidth: 160 }} />
              <button onClick={() => setHandleInput(suggestHandle())} className="nb-btn bg-white px-3 py-2 text-sm font-bold">🎲</button>
              <button onClick={saveHandle} disabled={handleBusy}
                className="nb-btn bg-[var(--nb-green)] px-4 py-2 font-black disabled:opacity-40">
                {handleBusy ? "…" : "就用这个,上榜 →"}
              </button>
            </div>
            <p className="mt-1 text-xs font-bold opacity-60">帮你起了一个,不满意随便改;设好这一步你就已经在个人榜上了</p>
          </div>
        ) : profile?.handle ? (
          <div className="nb-card bg-white px-4 py-2 text-sm font-black">🚩 {profile.handle} <span className="opacity-50">· 已在个人榜 ✓ · 改名去「我的」</span></div>
        ) : null}
      </section>

      {/* ② 公司绑定(可跳过;服务端唯一真相,改绑每周一次) */}
      <section className="mt-4">
        {company && !picking ? (
          <div className="nb-card flex items-center justify-between bg-white p-4">
            <div>
              <div className="text-xs font-bold opacity-60">我的公司</div>
              <div className="text-xl font-black">{company.name}</div>
            </div>
            {profile?.can_change ? (
              <button onClick={() => setPicking(true)} className="nb-btn bg-white px-3 py-1 text-sm font-bold">
                换一家
              </button>
            ) : (
              <span className="text-xs font-bold opacity-50">
                每周可改一次
                <br />
                下次:{profile?.next_change_at}
              </span>
            )}
          </div>
        ) : (
          <div className="nb-card bg-white p-4">
            <label className="text-sm font-extrabold">🏢 绑定公司(可跳过)—— 想上公司榜、跟别家比拼,才需要这一步</label>
            <p className="mt-1 text-xs font-bold opacity-60">
              🔒 对外只出现公司名和聚合数字,个人永不露名 · 绑定后每周可改一次,以后随时能换真公司。
            </p>
            {picking && (
              <button onClick={() => setPicking(false)} className="ml-3 text-xs font-bold underline opacity-60">
                取消
              </button>
            )}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索公司名…"
              className="mt-2 w-full border-3 p-3 font-bold outline-none"
              style={{ border: "3px solid var(--nb-ink)" }}
            />
            {q.trim() && (
              <div className="mt-2">
                {results.map((c) => (
                  <button key={c.id} onClick={() => pick(c)}
                    className="block w-full border-b-2 border-dashed border-black/20 p-2 text-left font-bold hover:bg-[var(--nb-yellow)]">
                    {c.name}
                  </button>
                ))}
                {!searching && (
                  <button onClick={createCompany}
                    className="mt-2 block w-full p-2 text-left text-sm font-bold text-[var(--nb-blue)]">
                    ＋ 没找到?创建「{q.trim()}」
                  </button>
                )}
              </div>
            )}
            {!picking && (
              <button onClick={soloSkip} disabled={!profile?.handle}
                className="nb-btn mt-3 w-full bg-[var(--nb-yellow)] py-2 font-black disabled:opacity-40"
                title={profile?.handle ? "" : "先在上面立个旗号"}>
                先跳过 —— 用旗号「{profile?.handle ?? "…"}」单飞上榜 →
              </button>
            )}
          </div>
        )}
      </section>

      {/* 绑定完成:接住用户,告诉他下一步去哪 */}
      {justBound && company && !picking && (
        <div className="nb-card mt-3 bg-[var(--nb-green)] p-4">
          <p className="font-black">{soloDone ? `✅ 已用旗号「${company.name}」单飞上榜(想上公司榜随时回来绑真公司)` : `✅ 已加入「${company.name}」`}</p>
          {fromCli ? (
            <p className="mt-1 text-sm font-bold">
              回到终端,剩下的安装会自动完成。装好后你的 Agent 干活时长会实时出现在这里:
            </p>
          ) : (
            <p className="mt-1 text-sm font-bold">下班时回来点下面的大按钮。现在先去转转:</p>
          )}
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/" className="nb-btn bg-[var(--nb-yellow)] px-4 py-2 text-sm font-black">
              📟 首页实况
            </Link>
            <Link href="/leaderboard" className="nb-btn bg-white px-4 py-2 text-sm font-black">
              🏆 排行榜
            </Link>
          </div>
        </div>
      )}

      {/* 大按钮 */}
      <section className="mt-8 text-center">
        <p className="mb-2 text-xs font-black opacity-60">
          🤖 Agent 考勤全自动,不用打卡 —— 这颗按钮是给你的:下班那一刻按一下
        </p>
        {shanghaiNow().hour >= 5 && shanghaiNow().hour < 12 ? (
          <p className="py-6 font-bold opacity-50">还早着呢 —— 中午 12:00 之后才能打下班卡,到点再来。</p>
        ) : (
        <button
          disabled={!company || busy}
          onClick={() => punch()}
          className="nb-btn w-full bg-[var(--nb-pink)] py-8 text-3xl font-black text-white disabled:opacity-40"
        >
          {busy ? "打卡中…" : today?.checked_in ? "更新为现在下班 🔁" : "我下班了 🎉"}
        </button>
        )}
        <p className="mt-2 text-xs font-bold opacity-50">
          匿名 · 一天一次 · 重复打卡以最后一次为准
        </p>
      </section>

      {/* 补卡 */}
      <section className="mt-8">
        <button onClick={() => setShowBackfill(!showBackfill)} className="text-sm font-extrabold underline opacity-70">
          {showBackfill ? "收起补卡" : "昨天忘打卡?补卡 →"}
        </button>
        {showBackfill && (
          <div className="nb-card mt-3 bg-white p-4">
            <div className="flex flex-wrap gap-3">
              <label className="font-bold">
                日期{" "}
                <input type="date" value={bfDate} onChange={(e) => setBfDate(e.target.value)}
                  className="border-3 p-2 font-bold" style={{ border: "3px solid var(--nb-ink)" }} />
              </label>
              <label className="font-bold">
                那天几点下班{" "}
                <input type="time" value={bfTime} onChange={(e) => setBfTime(e.target.value)}
                  className="border-3 p-2 font-bold" style={{ border: "3px solid var(--nb-ink)" }} />
              </label>
            </div>
            <button
              disabled={!company || !bfDate || busy}
              onClick={() => punch({ date: bfDate, time: bfTime })}
              className="nb-btn mt-3 bg-[var(--nb-blue)] px-4 py-2 font-black text-white disabled:opacity-40"
            >
              补卡
            </button>
          </div>
        )}
      </section>

      {error && (
        <p className="mt-4 text-center font-bold text-red-600">{error}</p>
      )}
    </main>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { deviceId, savedCompany, saveCompany, SavedCompany } from "@/lib/device";

type Company = { id: string; name: string };

export default function CheckinPage() {
  const [company, setCompany] = useState<SavedCompany | null>(null);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Company[]>([]);
  const [searching, setSearching] = useState(false);
  const [done, setDone] = useState<{ time: string; note: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [showBackfill, setShowBackfill] = useState(false);
  const [bfDate, setBfDate] = useState("");
  const [bfTime, setBfTime] = useState("19:00");
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setCompany(savedCompany());
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

  function pick(c: Company) {
    saveCompany(c);
    setCompany(c);
    setQ("");
    setResults([]);
  }

  async function punch(backfill?: { date: string; time: string }) {
    if (!company) return;
    setBusy(true);
    setError(null);
    const r = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: company.id, deviceId: deviceId(), backfill }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.ok) setDone({ time: d.clocked_local, note: d.note });
    else setError(d.error ?? "打卡失败,再试一次");
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
          <p className="mt-4 text-sm font-bold opacity-70">
            明早 10:00 揭榜,来看你公司排第几 →{" "}
            <Link href="/me" className="underline">我的排名</Link>
          </p>
        </div>
        <button onClick={() => setDone(null)} className="nb-btn mt-6 bg-white px-4 py-2 font-bold">
          返回
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-black">下班打卡</h1>

      {/* 选公司 */}
      <section className="mt-6">
        {company ? (
          <div className="nb-card flex items-center justify-between bg-white p-4">
            <div>
              <div className="text-xs font-bold opacity-60">我的公司</div>
              <div className="text-xl font-black">{company.name}</div>
            </div>
            <button onClick={() => setCompany(null)} className="nb-btn bg-white px-3 py-1 text-sm font-bold">
              换一家
            </button>
          </div>
        ) : (
          <div className="nb-card bg-white p-4">
            <label className="text-sm font-extrabold">你在哪家公司上班?</label>
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
          </div>
        )}
      </section>

      {/* 大按钮 */}
      <section className="mt-8 text-center">
        <button
          disabled={!company || busy}
          onClick={() => punch()}
          className="nb-btn w-full bg-[var(--nb-pink)] py-8 text-3xl font-black text-white disabled:opacity-40"
        >
          {busy ? "打卡中…" : "我下班了 🎉"}
        </button>
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

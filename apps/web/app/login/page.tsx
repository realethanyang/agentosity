"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deviceId } from "@/lib/device";
import { authState, saveAuth, clearAuth } from "@/lib/auth-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"email" | "code" | "done">(
    typeof window !== "undefined" && authState() ? "done" : "email"
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  const [deviceApproved, setDeviceApproved] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("device");
    if (code) setDeviceCode(code);
  }, []);

  function friendly(msg: string): string {
    if (/security purposes/i.test(msg)) return "发送太频繁了,等 60 秒再试";
    if (/expired|invalid/i.test(msg)) return "验证码不对或已过期";
    return msg;
  }

  async function approveDevice(token: string) {
    if (!deviceCode) return;
    const r = await fetch("/api/device/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: deviceCode }),
    });
    const d = await r.json();
    if (d.ok) setDeviceApproved(true);
    else setError(d.error ?? "授权失败");
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/auth/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.ok) setStage("code");
    else setError(friendly(d.error ?? "发送失败,稍后再试"));
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code, deviceId: deviceId() }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.ok) {
      saveAuth({ email: d.email, token: d.access_token, refresh: d.refresh_token });
      setStage("done");
      if (deviceCode) await approveDevice(d.access_token);
    } else setError(friendly(d.error ?? "验证失败"));
  }

  if (stage === "done") {
    const a = authState();
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="nb-card bg-[var(--nb-green)] p-8">
          <div className="text-4xl">✅</div>
          <h1 className="mt-2 text-2xl font-black">已登录</h1>
          <p className="mt-2 font-bold">{a?.email}</p>
          <p className="mt-2 text-sm font-bold opacity-70">
            这台设备的打卡历史已合并进账号,换设备登录同一邮箱即可同步。
          </p>
        </div>
        {deviceCode && !deviceApproved && (
          <button
            onClick={() => a && approveDevice(a.token)}
            className="nb-btn mt-6 bg-[var(--nb-blue)] px-6 py-3 font-black text-white"
          >
            授权菜单栏 App 使用此账号 →
          </button>
        )}
        {deviceApproved && (
          <p className="mt-6 text-lg font-black">🎉 菜单栏 App 已登录,回到它看看吧(本页可关闭)</p>
        )}
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/me" className="nb-btn bg-white px-4 py-2 font-bold">我的排名 →</Link>
          <button
            onClick={() => { clearAuth(); setStage("email"); }}
            className="nb-btn bg-white px-4 py-2 font-bold opacity-60">
            退出登录
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-black">登录</h1>
      <p className="mt-1 text-sm font-bold opacity-60">
        无密码,邮箱收 6 位验证码。登录后多设备同步你的打卡记录。
      </p>

      <div className="nb-card mt-6 bg-white p-5">
        {stage === "email" ? (
          <>
            <label className="text-sm font-extrabold">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="mt-2 w-full p-3 font-bold outline-none"
              style={{ border: "3px solid var(--nb-ink)" }}
            />
            <button
              disabled={busy || !email.includes("@")}
              onClick={sendCode}
              className="nb-btn mt-4 w-full bg-[var(--nb-blue)] py-3 font-black text-white disabled:opacity-40"
            >
              {busy ? "发送中…" : "发验证码"}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-bold">
              验证码已发到 <span className="font-black">{email}</span>(几分钟内有效)
            </p>
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6 位验证码"
              className="mt-3 w-full p-3 text-center text-2xl font-black tracking-widest outline-none"
              style={{ border: "3px solid var(--nb-ink)" }}
            />
            <button
              disabled={busy || code.trim().length < 6}
              onClick={verify}
              className="nb-btn mt-4 w-full bg-[var(--nb-pink)] py-3 font-black text-white disabled:opacity-40"
            >
              {busy ? "验证中…" : "登录"}
            </button>
            <button onClick={() => setStage("email")} className="mt-3 text-xs font-bold underline opacity-60">
              换个邮箱
            </button>
          </>
        )}
        {error && <p className="mt-3 text-center text-sm font-bold text-red-600">{error}</p>}
      </div>
    </main>
  );
}

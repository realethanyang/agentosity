"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { deviceId } from "@/lib/device";
import { fmtMinutes } from "@/lib/time";
import { freshAuthHeaders, authState } from "@/lib/auth-client";

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

export default function MePage() {
  const [data, setData] = useState<MyRank | null>(null);

  useEffect(() => {
    freshAuthHeaders().then((headers) =>
      fetch(`/api/me?device=${deviceId()}`, { headers })
        .then((r) => r.json())
        .then(setData)
    );
  }, []);

  const logged = typeof window !== "undefined" ? authState() : null;

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <h1 className="text-3xl font-black">我的排名</h1>
      <p className="mt-1 text-sm font-bold opacity-60">
        只有你自己看得到,绝不公开。
        {logged ? (
          <span className="ml-2">已登录 {logged.email}</span>
        ) : (
          <Link href="/login" className="ml-2 underline">登录同步多设备 →</Link>
        )}
      </p>

      {!data ? (
        <p className="py-10 text-center font-bold opacity-50">查询中…</p>
      ) : !data.found ? (
        <div className="nb-card mt-6 bg-white p-8 text-center">
          <p className="text-lg font-black">还没有你的打卡记录</p>
          <Link href="/checkin" className="nb-btn mt-4 inline-block bg-[var(--nb-pink)] px-6 py-3 font-black text-white">
            先去打一次卡 →
          </Link>
        </div>
      ) : data.no_data ? (
        <div className="nb-card mt-6 bg-white p-8 text-center">
          <p className="text-lg font-black">你的公司在 {data.day} 还没有有效打卡</p>
          <p className="mt-2 text-sm font-bold opacity-60">拉上同事一起打卡,1 个人也能上榜。</p>
        </div>
      ) : (
        <div className="nb-card mt-6 p-8 text-center"
          style={{ background: (data.rank ?? 99) <= 3 ? "var(--nb-yellow)" : "white" }}>
          <div className="text-sm font-bold opacity-60">{data.day} · {data.company}</div>
          <div className="mt-2 text-6xl font-black tabular-nums">
            #{data.rank}
            <span className="text-2xl opacity-50"> / {data.total}</span>
          </div>
          <div className="mt-2 font-bold">
            平均 {fmtMinutes(data.avg_minutes)} 下班 · {data.checkin_count} 人打卡
          </div>
          {(data.rank ?? 99) <= 3 ? (
            <p className="mt-4 text-xl font-black">🏆 你们公司在榜上!值得炫耀!</p>
          ) : (
            <p className="mt-4 font-bold">
              离进前三还差{" "}
              <span className="text-2xl font-black text-[var(--nb-pink)]">
                {data.gap_to_top3} 分钟
              </span>
              <br />
              <span className="text-sm opacity-60">明天早点走,或者……多派几个 Agent 加班?</span>
            </p>
          )}
        </div>
      )}
    </main>
  );
}

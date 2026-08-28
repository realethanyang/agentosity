import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { shanghaiNow, todayKey } from "@/lib/time";
import { userTokenFromRequest } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/**
 * 打卡。body: { companyId, deviceId, backfill?: { date: "YYYY-MM-DD", time: "HH:MM" } }
 * 补卡时 clocked_at 按上海时区拼装;day_key 服务端按 5:00 分界计算。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { companyId, deviceId, backfill } = body ?? {};
  const userToken = (await userTokenFromRequest(req)) ?? deviceId;
  if (!companyId || !userToken) {
    return NextResponse.json({ error: "缺少 companyId / deviceId" }, { status: 400 });
  }

  let clockedAt: Date;
  let dayKey: string;
  let isBackfill = false;

  if (backfill?.date && backfill?.time) {
    isBackfill = true;
    // 上海本地时间 → UTC(+08:00 固定,无夏令时)
    clockedAt = new Date(`${backfill.date}T${backfill.time}:00+08:00`);
    const [h] = backfill.time.split(":").map(Number);
    dayKey = h < 5 ? shiftDay(backfill.date, -1) : backfill.date;
    if (clockedAt > new Date()) {
      return NextResponse.json({ error: "不能给未来打卡" }, { status: 400 });
    }
  } else {
    clockedAt = new Date();
    dayKey = todayKey();
  }

  const { error } = await db().from("checkins").upsert(
    {
      company_id: companyId,
      user_token: userToken,
      clocked_at: clockedAt.toISOString(),
      day_key: dayKey,
      backfill: isBackfill,
    },
    { onConflict: "user_token,day_key" }
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // 你是今天第几个下班的(公司内 / 全网,按打卡时刻排)
  const iso = clockedAt.toISOString();
  const [companyRank, globalRank] = await Promise.all([
    db().from("checkins").select("*", { count: "exact", head: true })
      .eq("day_key", dayKey).eq("company_id", companyId).lte("clocked_at", iso),
    db().from("checkins").select("*", { count: "exact", head: true })
      .eq("day_key", dayKey).lte("clocked_at", iso),
  ]);

  const s = shanghaiNow(clockedAt);
  const early = s.hour < 5; // 凌晨打卡归前一天
  return NextResponse.json({
    ok: true,
    day_key: dayKey,
    clocked_local: `${s.date} ${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`,
    rank_company: companyRank.count ?? null,
    rank_global: globalRank.count ?? null,
    note: early ? "凌晨打卡,这条算作前一天的下班" : null,
  });
}

function shiftDay(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { shanghaiNow, todayKey } from "@/lib/time";
import { userTokenFromRequest } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** 今日打卡状态(menu bar 与 Web 打卡页共用,保证两端感知一致) */
export async function GET(req: NextRequest) {
  const device = new URL(req.url).searchParams.get("device");
  const token = (await userTokenFromRequest(req)) ?? device;
  if (!token) return NextResponse.json({ error: "缺少身份" }, { status: 400 });

  const { data, error } = await db()
    .from("checkins")
    .select("clocked_at, companies(name)")
    .eq("user_token", token)
    .eq("day_key", todayKey())
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!data) return NextResponse.json({ checked_in: false });
  const s = shanghaiNow(new Date(data.clocked_at));
  const company = (data.companies as unknown as { name: string } | null)?.name ?? null;
  return NextResponse.json({
    checked_in: true,
    clocked_local: `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`,
    company,
  });
}

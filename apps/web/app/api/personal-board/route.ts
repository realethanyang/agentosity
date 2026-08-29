import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { todayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

/** 个人榜(旗号制,公司无关;days=1|7|30) */
export async function GET(req: NextRequest) {
  const daysParam = new URL(req.url).searchParams.get("days");
  const days = daysParam === "30" ? 30 : daysParam === "7" ? 7 : 1;
  const to = todayKey();
  const from = new Date(`${to}T12:00:00Z`);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  const { data, error } = await db().rpc("fn_personal_board", {
    p_from: from.toISOString().slice(0, 10),
    p_to: to,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ period: { from: from.toISOString().slice(0, 10), to, days }, board: data });
}

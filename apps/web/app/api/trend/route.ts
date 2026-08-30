import { NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 全站逐日 agent-hours 趋势 + 历史累计 */
export async function GET() {
  const { data, error } = await db().rpc("fn_platform_trend", { p_days: 14 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 批量心跳:雷达一台机器可能在册数百条会话,逐条上报会烧穿边缘请求额度。
 * body: { beats: [{ session_id, active_seconds?, probe?, active? }, ...] }(上限 500)
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const beats = Array.isArray(body?.beats) ? body.beats.slice(0, 500) : null;
  if (!beats?.length) return NextResponse.json({ error: "缺少 beats" }, { status: 400 });

  const { error } = await db().rpc("fn_heartbeats", { p_beats: beats });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, count: beats.length });
}

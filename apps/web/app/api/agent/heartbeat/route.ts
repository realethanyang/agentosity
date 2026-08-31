import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * Agent 考勤:心跳。body: { session_id, active_seconds?, probe?, active? }
 * 服务端原子处理:跨天会话先滚账(昨日账归档,今日从 5:00 重新起算),
 * 客户端的累计活跃秒数经 active_offset 换算——常驻 Agent 挂多少天都不串账。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.session_id) return NextResponse.json({ error: "缺少 session_id" }, { status: 400 });

  const { error } = await db().rpc("fn_heartbeat", {
    p_id: body.session_id,
    p_active: Number.isFinite(body.active_seconds) ? Math.max(0, Math.floor(body.active_seconds)) : null,
    p_probe: typeof body.probe === "string" ? body.probe : null,
    p_is_active: body.active === true,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

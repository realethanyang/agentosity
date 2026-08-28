import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Agent 考勤:心跳。body: { session_id, active_seconds?, probe? } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.session_id) return NextResponse.json({ error: "缺少 session_id" }, { status: 400 });

  const patch: Record<string, unknown> = { last_heartbeat_at: new Date().toISOString() };
  if (Number.isFinite(body.active_seconds)) patch.active_seconds = Math.max(0, Math.floor(body.active_seconds));
  if (typeof body.probe === "string") patch.probe = body.probe;

  const { error } = await db()
    .from("agent_sessions")
    .update(patch)
    .eq("id", body.session_id)
    .is("ended_at", null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

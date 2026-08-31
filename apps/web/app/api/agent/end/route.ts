import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Agent 考勤:会话结束(进程遗言,best-effort)。累计值经 active_offset 换算。 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body?.session_id) return NextResponse.json({ error: "缺少 session_id" }, { status: 400 });

  const { error } = await db().rpc("fn_session_end", {
    p_id: body.session_id,
    p_active: Number.isFinite(body.active_seconds) ? Math.max(0, Math.floor(body.active_seconds)) : null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

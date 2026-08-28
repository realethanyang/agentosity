import { NextRequest, NextResponse } from "next/server";
import { anonClient } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** 用 refresh_token 换新的会话(Supabase refresh token 轮换:旧的作废,存新的) */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const rt = body?.refresh_token;
  if (!rt) return NextResponse.json({ error: "缺少 refresh_token" }, { status: 400 });

  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: rt });
  if (error || !data.session) {
    return NextResponse.json({ error: error?.message ?? "会话已失效,请重新登录" }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    email: data.user?.email,
  });
}

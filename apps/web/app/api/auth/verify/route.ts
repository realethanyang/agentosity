import { NextRequest, NextResponse } from "next/server";
import { anonClient } from "@/lib/auth-server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 校验验证码,成功后把该设备的历史打卡合并进账号。
 * body: { email, code, deviceId? }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  const code = body?.code?.trim();
  if (!email || !code) return NextResponse.json({ error: "缺少 email / code" }, { status: 400 });

  const { data, error } = await anonClient().auth.verifyOtp({
    email,
    token: code,
    type: "email",
  });
  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: error?.message ?? "验证码不对或已过期" }, { status: 401 });
  }

  const userToken = `user:${data.user.id}`;

  // 设备历史合并进账号(打卡 + agent 会话)
  if (body?.deviceId) {
    await db().from("checkins").update({ user_token: userToken }).eq("user_token", body.deviceId);
    await db().from("agent_sessions").update({ user_token: userToken }).eq("user_token", body.deviceId);
  }

  return NextResponse.json({
    ok: true,
    email,
    access_token: data.session.access_token,
  });
}

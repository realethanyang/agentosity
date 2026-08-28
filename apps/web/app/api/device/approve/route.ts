import { NextRequest, NextResponse } from "next/server";
import { anonClient, dbPublic } from "@/lib/auth-server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * 设备授权流第 2 步:浏览器登录态授权后,服务端给设备"另开"一个独立会话
 * (不是转交浏览器的 token——refresh token 是轮换制,共用会互相踢下线)
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = body?.code?.trim();
  const auth = req.headers.get("authorization");
  const jwt = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!code || !jwt) return NextResponse.json({ error: "缺少 code / 登录态" }, { status: 400 });

  const { data: userData, error: userErr } = await db().auth.getUser(jwt);
  if (userErr || !userData.user?.email) return NextResponse.json({ error: "登录态无效" }, { status: 401 });

  // 服务端静默走一遍 magic link(不发邮件),为设备铸造独立会话
  const { data: linkData, error: linkErr } = await dbPublic().auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    return NextResponse.json({ error: linkErr?.message ?? "无法创建设备会话" }, { status: 500 });
  }
  const { data: sess, error: sessErr } = await anonClient().auth.verifyOtp({
    type: "email",
    token_hash: tokenHash,
  });
  if (sessErr || !sess.session) {
    return NextResponse.json({ error: sessErr?.message ?? "设备会话创建失败" }, { status: 500 });
  }

  const { data, error } = await dbPublic()
    .from("device_codes")
    .update({
      access_token: sess.session.access_token,
      refresh_token: sess.session.refresh_token,
      email: userData.user.email,
      approved_at: new Date().toISOString(),
    })
    .eq("code", code)
    .is("approved_at", null)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .select("code")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "code 无效或已过期" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

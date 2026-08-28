import { NextRequest, NextResponse } from "next/server";
import { dbPublic } from "@/lib/auth-server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** 设备授权流第 2 步:已登录的浏览器把自己的 token 交给 code */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const code = body?.code?.trim();
  const auth = req.headers.get("authorization");
  const jwt = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!code || !jwt) return NextResponse.json({ error: "缺少 code / 登录态" }, { status: 400 });

  const { data: userData, error: userErr } = await db().auth.getUser(jwt);
  if (userErr || !userData.user) return NextResponse.json({ error: "登录态无效" }, { status: 401 });

  const { data, error } = await dbPublic()
    .from("device_codes")
    .update({ access_token: jwt, email: userData.user.email, approved_at: new Date().toISOString() })
    .eq("code", code)
    .is("approved_at", null)
    .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
    .select("code")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "code 无效或已过期" }, { status: 400 });
  return NextResponse.json({ ok: true });
}

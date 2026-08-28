import { NextRequest, NextResponse } from "next/server";
import { anonClient } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** 发送 6 位验证码到邮箱(无密码登录) */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email = body?.email?.trim()?.toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "邮箱格式不对" }, { status: 400 });
  }
  const { error } = await anonClient().auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

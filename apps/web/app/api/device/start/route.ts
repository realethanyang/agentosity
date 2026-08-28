import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { dbPublic } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

/** 设备授权流第 1 步:app 领一个一次性 code */
export async function POST() {
  const code = randomBytes(6).toString("hex"); // 12 位,URL 友好
  const { error } = await dbPublic().from("device_codes").insert({ code });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ code });
}

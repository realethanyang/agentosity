import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { userTokenFromRequest, authFromRequest } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const CHANGE_INTERVAL_MS = 7 * 24 * 3600 * 1000; // 改绑限频:每周一次

export async function GET(req: NextRequest) {
  const { userToken, provided } = await authFromRequest(req);
  // 带了 token 但校验失败 → 明确报 401,绝不静默降级成设备身份(会拿到错误的空数据)
  if (provided && !userToken) {
    return NextResponse.json({ error: "登录态校验失败,稍后重试" }, { status: 401 });
  }
  const device = new URL(req.url).searchParams.get("device");
  const token = userToken ?? device;
  if (!token) return NextResponse.json({ error: "缺少身份" }, { status: 400 });

  const { data, error } = await db()
    .from("profiles")
    .select("company_changed_at, handle, companies(id, name)")
    .eq("user_token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const company = (data?.companies as unknown as { id: string; name: string } | null) ?? null;
  const changedAt = data?.company_changed_at ? new Date(data.company_changed_at).getTime() : null;
  const nextChangeAt = changedAt ? new Date(changedAt + CHANGE_INTERVAL_MS) : null;
  return NextResponse.json({
    company,
    handle: data?.handle ?? null,
    can_change: !company || !nextChangeAt || Date.now() >= nextChangeAt.getTime(),
    next_change_at: nextChangeAt && Date.now() < nextChangeAt.getTime() ? nextChangeAt.toISOString().slice(0, 10) : null,
  });
}

/** 绑定/改绑公司或设置个人旗号。首绑免费;改绑公司每周一次。body: { companyId?, handle?, deviceId? } */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const authToken = await userTokenFromRequest(req);
  if (process.env.REQUIRE_LOGIN === "1" && !authToken) {
    return NextResponse.json({ error: "需要登录后绑定" }, { status: 401 });
  }
  const token = authToken ?? body?.deviceId ?? null;
  const companyId = body?.companyId;
  const handle = typeof body?.handle === "string" ? body.handle.trim() : null;
  if (!token) return NextResponse.json({ error: "缺少身份" }, { status: 400 });

  // 只设旗号(个人榜身份),不动公司绑定
  if (handle !== null && !companyId) {
    if (handle.length < 2 || handle.length > 20) {
      return NextResponse.json({ error: "旗号长度 2–20 个字符" }, { status: 400 });
    }
    const { data: taken } = await db()
      .from("profiles")
      .select("user_token")
      .ilike("handle", handle)
      .neq("user_token", token)
      .maybeSingle();
    if (taken) return NextResponse.json({ error: "这个旗号被人抢先了,换一个" }, { status: 409 });
    const { data: existing } = await db()
      .from("profiles").select("user_token").eq("user_token", token).maybeSingle();
    const { error } = existing
      ? await db().from("profiles").update({ handle }).eq("user_token", token)
      : await db().from("profiles").insert({ user_token: token, handle });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, handle });
  }

  if (!companyId) return NextResponse.json({ error: "缺少 companyId / handle" }, { status: 400 });

  const supa = db();
  const { data: existing } = await supa
    .from("profiles")
    .select("company_id, company_changed_at")
    .eq("user_token", token)
    .maybeSingle();

  if (existing?.company_id === companyId) return NextResponse.json({ ok: true, unchanged: true });

  if (existing?.company_id) {
    const nextAt = new Date(existing.company_changed_at).getTime() + CHANGE_INTERVAL_MS;
    if (Date.now() < nextAt) {
      return NextResponse.json(
        {
          error: `改绑公司每周最多一次,下次可改:${new Date(nextAt).toISOString().slice(0, 10)}`,
          next_change_at: new Date(nextAt).toISOString().slice(0, 10),
        },
        { status: 429 }
      );
    }
  }

  const { error } = await supa.from("profiles").upsert({
    user_token: token,
    company_id: companyId,
    company_changed_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

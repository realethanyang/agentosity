import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";
import { userTokenFromRequest } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

const CHANGE_INTERVAL_MS = 7 * 24 * 3600 * 1000; // 改绑限频:每周一次

async function tokenOf(req: NextRequest): Promise<string | null> {
  const device = new URL(req.url).searchParams.get("device");
  return (await userTokenFromRequest(req)) ?? device;
}

export async function GET(req: NextRequest) {
  const token = await tokenOf(req);
  if (!token) return NextResponse.json({ error: "缺少身份" }, { status: 400 });

  const { data, error } = await db()
    .from("profiles")
    .select("company_changed_at, companies(id, name)")
    .eq("user_token", token)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const company = (data?.companies as unknown as { id: string; name: string } | null) ?? null;
  const changedAt = data?.company_changed_at ? new Date(data.company_changed_at).getTime() : null;
  const nextChangeAt = changedAt ? new Date(changedAt + CHANGE_INTERVAL_MS) : null;
  return NextResponse.json({
    company,
    can_change: !company || !nextChangeAt || Date.now() >= nextChangeAt.getTime(),
    next_change_at: nextChangeAt && Date.now() < nextChangeAt.getTime() ? nextChangeAt.toISOString().slice(0, 10) : null,
  });
}

/** 绑定/改绑公司。首绑免费;改绑每周一次。body: { companyId, deviceId? } */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = (await userTokenFromRequest(req)) ?? body?.deviceId ?? null;
  const companyId = body?.companyId;
  if (!token || !companyId) return NextResponse.json({ error: "缺少身份 / companyId" }, { status: 400 });

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

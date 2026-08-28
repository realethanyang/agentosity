import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) {
    const { data, error } = await db()
      .from("companies")
      .select("id, name")
      .order("name")
      .limit(12);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }
  // 中英文名/别名同搜(深度求索 = DeepSeek)
  const { data, error } = await db().rpc("fn_search_companies", { p_q: q });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = body?.name?.trim();
  if (!name || name.length > 40) {
    return NextResponse.json({ error: "公司名不合法" }, { status: 400 });
  }
  // 名字/别名精确认领(大小写不敏感),避免同一公司分裂("DeepSeek" 与 "深度求索" 是一家)
  const { data: foundId } = await db().rpc("fn_find_company", { p_name: name });
  if (foundId) {
    const { data: found } = await db().from("companies").select("id, name").eq("id", foundId).single();
    if (found) return NextResponse.json(found);
  }

  const { data, error } = await db()
    .from("companies")
    .upsert(
      { name, source: "user_created" },
      { onConflict: "name", ignoreDuplicates: false }
    )
    .select("id, name")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

import { createClient } from "@supabase/supabase-js";
import { db } from "@/lib/supabase";

/** 匿名 client:仅用于发送/校验 OTP */
export function anonClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
}

/** 从 Authorization: Bearer <jwt> 解析出账号态 user_token('user:<uid>'),无/无效则 null */
export async function userTokenFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  const jwt = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!jwt) return null;
  const { data, error } = await db().auth.getUser(jwt);
  if (error || !data.user) return null;
  return `user:${data.user.id}`;
}

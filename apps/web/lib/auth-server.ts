import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { db } from "@/lib/supabase";

let pub: SupabaseClient | null = null;

/** 永远指向 public schema 的 client:登录/设备授权等全局表,不随 DATA_SCHEMA 走 */
export function dbPublic(): SupabaseClient {
  if (!pub) {
    pub = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return pub;
}

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

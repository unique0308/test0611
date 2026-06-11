import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 前端使用的客户端,只能用 anon key
// 写操作必须经 /api/* 路由(CLAUDE.md 第 8 节)
export function getBrowserClient() {
  if (!url || !anonKey) {
    throw new Error(
      "Supabase env not configured: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing. " +
        "见 LOCAL_SECRETS.md 第 1 节。"
    );
  }
  return createClient(url, anonKey, {
    auth: { persistSession: false }
  });
}

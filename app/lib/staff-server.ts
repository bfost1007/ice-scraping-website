import "server-only";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { COOKIE_NAME, verifySession } from "./session";
import type { StaffSession } from "./staff-types";

export function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

export async function authSession(request?: Request): Promise<StaffSession | null> {
  let token: string | undefined;
  if (request) {
    const pair = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${COOKIE_NAME}=`));
    token = pair?.slice(COOKIE_NAME.length + 1);
  } else {
    token = (await cookies()).get(COOKIE_NAME)?.value;
  }
  const session = await verifySession(token);
  if (!session || session.role === "owner") return session;
  try {
    const { data, error } = await getDb().from("staff_members").select("id,name,active").eq("id", session.workerId!).eq("active", true).maybeSingle();
    if (error || !data) return null;
    return { role: "worker", workerId: data.id, name: data.name };
  } catch {
    return null;
  }
}

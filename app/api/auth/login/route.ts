import { sameOriginRequest } from "../../../lib/request-origin";
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb } from "../../../lib/staff-server";
import { COOKIE_NAME, SESSION_SECONDS, signSession } from "../../../lib/session";
import type { StaffSession } from "../../../lib/staff-types";

function equalSecret(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return NextResponse.json({ error: "Please sign in from this website." }, { status: 403 });
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Please enter your login details." }, { status: 400 });
  }
  const role = body?.role ?? "owner";
  const username = body?.username;
  const password = body?.password;
  if (!["owner", "worker"].includes(role) || typeof username !== "string" || typeof password !== "string" || !username.trim() || !password || username.length > 254 || password.length > 1024) {
    return NextResponse.json({ error: "Please enter your login details." }, { status: 400 });
  }
  if (!process.env.INTERNAL_SESSION_TOKEN) return NextResponse.json({ error: "Internal login is not configured." }, { status: 503 });

  let session: StaffSession;
  if (role === "owner") {
    const configuredUsername = process.env.INTERNAL_USERNAME;
    const configuredPassword = process.env.INTERNAL_PASSWORD;
    if (!configuredUsername || !configuredPassword) return NextResponse.json({ error: "Internal login is not configured." }, { status: 503 });
    if (!equalSecret(username, configuredUsername) || !equalSecret(password, configuredPassword)) return NextResponse.json({ error: "Incorrect username or password." }, { status: 401 });
    session = { role: "owner", name: configuredUsername };
  } else {
    try {
      // Use a fresh client for authentication; never share a signed-in client
      // with service-role database operations in another request.
      const db = getDb();
      const { data: login, error: loginError } = await db.auth.signInWithPassword({ email: username.trim().toLowerCase(), password });
      if (loginError) {
        if (loginError.status === 429) return NextResponse.json({ error: "Too many sign-in attempts. Please wait a moment and try again." }, { status: 429 });
        if (loginError.name === "AuthRetryableFetchError" || !loginError.status || loginError.status >= 500) {
          return NextResponse.json({ error: "Employee login is unavailable. Check the Supabase connection or contact the owner." }, { status: 503 });
        }
        return NextResponse.json({ error: "Incorrect email or password, or this employee account is unavailable." }, { status: 401 });
      }
      if (!login.user) return NextResponse.json({ error: "Employee login is unavailable. Contact the owner." }, { status: 503 });
      const { data: worker, error } = await getDb().from("staff_members").select("id,name,active").eq("id", login.user.id).eq("active", true).maybeSingle();
      if (error) return NextResponse.json({ error: "Employee accounts are unavailable. Check the staff database setup or contact the owner." }, { status: 503 });
      if (!worker) return NextResponse.json({ error: "This employee account is unavailable. Contact the owner." }, { status: 401 });
      session = { role: "worker", name: worker.name, workerId: worker.id };
    } catch {
      return NextResponse.json({ error: "Employee login is unavailable. Contact the owner." }, { status: 503 });
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, await signSession(session), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_SECONDS });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

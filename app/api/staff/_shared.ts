import { sameOriginRequest } from "../../lib/request-origin";
import { NextResponse } from "next/server";
import { authSession, getDb } from "../../lib/staff-server";
import type { Job, StaffSession } from "../../lib/staff-types";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
export function databaseError(error: { code?: string; message?: string } | null, fallback: string): never {
  if (error?.code === "42P01" || error?.code === "PGRST205" || error?.code === "42703") {
    throw new ApiError(503, "Staff database setup is required. Run supabase/staff-portal.sql in your development Supabase project.");
  }
  if (error?.code === "23505") throw new ApiError(409, "This record already exists. Refresh and try again.");
  throw new ApiError(503, fallback);
}
export async function staffApi(request: Request, role: "owner" | "worker" | "either", action: (session: StaffSession, db: ReturnType<typeof getDb>) => Promise<Response>) {
  try {
    if (request.method !== "GET") {
      if (!sameOriginRequest(request)) {
        throw new ApiError(403, "This action must be submitted from the staff portal.");
      }
    }
    const session = await authSession(request);
    if (!session) throw new ApiError(401, "Please sign in again.");
    if (role !== "either" && session.role !== role) throw new ApiError(403, "You do not have permission for this action.");
    return await action(session, getDb());
  } catch (error) {
    if (error instanceof ApiError) return json({ error: error.message }, error.status);
    return json({ error: "The staff service is unavailable. Check the Supabase configuration and network access." }, 503);
  }
}
export async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ApiError(400, "Please provide a valid JSON request."); }
}
export function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value)) throw new ApiError(400, "Invalid record identifier.");
  return value;
}
export function text(value: unknown, max: number, label: string, required = true) {
  if (typeof value !== "string" || value.trim().length > max || (required && !value.trim())) throw new ApiError(400, `Please provide ${label} (${max} characters maximum).`);
  return value.trim();
}
export function serviceDate(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new ApiError(400, "Please choose a valid service date.");
  return value;
}
export function boiseToday() { return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Boise", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export async function jobFor(id: unknown, session: StaffSession, db: ReturnType<typeof getDb>): Promise<Job> {
  let query = db.from("service_jobs").select("*").eq("id", uuid(id));
  if (session.role === "worker") query = query.eq("worker_id", session.workerId!);
  const { data, error } = await query.maybeSingle();
  if (error) databaseError(error, "Could not load this service job.");
  if (!data) throw new ApiError(404, "This service job was not found.");
  return data as Job;
}
export async function saveJob(db: ReturnType<typeof getDb>, job: Job, patch: Partial<Job>) {
  const { data, error } = await db.from("service_jobs").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", job.id).eq("updated_at", job.updated_at).select("id").maybeSingle();
  if (error) databaseError(error, "Could not save this service job.");
  if (!data) throw new ApiError(409, "This job changed in another session. Refresh before trying again.");
}

// Stay below Supabase's default 1,000-row response cap; never show silently
// truncated schedules or financial/customer counts.
export async function allRows<T>(query: (start: number, end: number) => PromiseLike<{ data: unknown[] | null; error: { code?: string; message?: string } | null }>, fallback: string): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let start = 0; start < 20000; start += pageSize) {
    const result = await query(start, start + pageSize - 1);
    if (result.error) databaseError(result.error, fallback);
    const page = (result.data || []) as T[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new ApiError(503, "This staff history is too large to load safely. Contact the owner to narrow the saved history.");
}

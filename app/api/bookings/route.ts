import { sameOriginRequest } from "../../lib/request-origin";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SERVICE_WINDOWS } from "../../service-windows";
import { authSession } from "../../lib/staff-server";
const SERVICE_ZIPS = new Set(["83440", "83441", "83460"]);
export async function PATCH(request: Request) {
  const session = await authSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "owner") return NextResponse.json({ error: "Only the owner can update payments." }, { status: 403 });
  if (!sameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid payment update." }, { status: 400 });
  const { id, payment_status } = body;
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1 || !["Paid", "Unpaid"].includes(payment_status)) return NextResponse.json({ error: "Invalid payment update." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: updated, error } = await supabase.from("bookings").update({ payment_status }).eq("id", Number(id)).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not update payment status." }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
export async function POST(request: Request) {
  if (!sameOriginRequest(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Please provide a valid booking request." }, { status: 400 });
  const required = ["first_name", "last_name", "street_address", "city", "zip_code", "phone", "car_make", "car_model", "car_color", "license_plate", "license_state", "service_day", "scrape_by_time", "subscription_tier", "subscription_frequency", "payment_option"];
  if (required.some(key => typeof body[key] !== "string" || !body[key].trim() || body[key].length > 500)) return NextResponse.json({ error: "Please complete all required fields." }, { status: 400 });
  const zip = body.zip_code.trim(); const day = body.service_day; const time = body.scrape_by_time;
  const phone = body.phone.replace(/\D/g, "");
  if (phone.length !== 10) return NextResponse.json({ error: "Please enter a valid 10-digit phone number." }, { status: 422 });
  if (!SERVICE_ZIPS.has(zip)) return NextResponse.json({ error: "Sorry, this address is outside our current service area." }, { status: 422 });
  if (!Object.prototype.hasOwnProperty.call(SERVICE_WINDOWS, day) || !SERVICE_WINDOWS[day]?.includes(time)) return NextResponse.json({ error: "That service time is not available for the selected day." }, { status: 422 });
  if (!["Basic", "Premium"].includes(body.subscription_tier) || !["Daily", "Weekly", "Monthly", "Semester"].includes(body.subscription_frequency) || !["Venmo", "Zelle", "Cash"].includes(body.payment_option)) return NextResponse.json({ error: "Please choose a valid plan and payment option." }, { status: 422 });
  let schedule: unknown;
  try { schedule = typeof body.weekly_schedule === "string" ? JSON.parse(body.weekly_schedule) : body.weekly_schedule ?? {}; }
  catch { return NextResponse.json({ error: "Invalid weekly schedule." }, { status: 400 }); }
  if (!schedule || typeof schedule !== "object" || Array.isArray(schedule)) return NextResponse.json({ error: "Invalid weekly schedule." }, { status: 400 });
  const weeklySchedule: Record<string, string> = {};
  for (const [selectedDay, selectedTime] of Object.entries(schedule)) {
    if (!Object.prototype.hasOwnProperty.call(SERVICE_WINDOWS, selectedDay) || typeof selectedTime !== "string" || (selectedTime !== "" && !SERVICE_WINDOWS[selectedDay].includes(selectedTime))) return NextResponse.json({ error: "One of the selected service times is not available." }, { status: 422 });
    if (selectedTime) weeklySchedule[selectedDay] = selectedTime;
  }
  if (!Object.keys(weeklySchedule).length) weeklySchedule[day] = time;
  if (weeklySchedule[day] !== time) return NextResponse.json({ error: "The selected day and time do not match your weekly schedule." }, { status: 422 });
  if ((body.notes != null && (typeof body.notes !== "string" || body.notes.length > 2000)) || (body.apartment_complex != null && (typeof body.apartment_complex !== "string" || body.apartment_complex.length > 500))) return NextResponse.json({ error: "Please shorten your apartment or booking notes." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await supabase.from("bookings").insert({ first_name: body.first_name.trim(), last_name: body.last_name.trim(), street_address: `${body.street_address.trim()}, ${body.city.trim()}, ${zip}`, apartment_complex: body.apartment_complex?.trim() || null, phone: `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`, car_make: body.car_make.trim(), car_model: body.car_model.trim(), car_color: body.car_color.trim(), license_plate: body.license_plate.trim(), license_state: body.license_state.trim(), service_day: day, scrape_by_time: time, weekly_schedule: weeklySchedule, subscription_tier: body.subscription_tier, subscription_frequency: body.subscription_frequency, status: "Active", payment_option: body.payment_option, payment_status: "Unpaid", notes: body.notes?.trim() || null });
    if (error) return NextResponse.json({ error: "Booking service is unavailable. Please try again later." }, { status: 503 });
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: "Booking service is unavailable. Please try again later." }, { status: 503 }); }
}

import { allRows, boiseToday, json, serviceDate, staffApi } from "./_shared";
import type { Booking, Job, StaffMember, StaffRequest } from "../../lib/staff-types";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return staffApi(request, "either", async (session, db) => {
    const date = serviceDate(new URL(request.url).searchParams.get("date") || boiseToday());
    const lower = new Date(date); lower.setUTCDate(lower.getUTCDate() - 30);
    const upper = new Date(date); upper.setUTCDate(upper.getUTCDate() + 90);
    let jobsQuery = db.from("service_jobs").select("*").gte("service_date", lower.toISOString().slice(0, 10)).lte("service_date", upper.toISOString().slice(0, 10)).order("service_date").order("id");
    let workersQuery = db.from("staff_members").select("id,name,email,active,created_at").order("name");
    let requestsQuery = db.from("staff_requests").select("*").order("created_at", { ascending: false });
    if (session.role === "worker") {
      jobsQuery = jobsQuery.eq("worker_id", session.workerId!);
      workersQuery = workersQuery.eq("id", session.workerId!);
      requestsQuery = requestsQuery.eq("worker_id", session.workerId!);
    }
    const [jobs, workers, requests] = await Promise.all([
      allRows<Job>((start, end) => jobsQuery.range(start, end), "Could not load route jobs. Check the Supabase connection."),
      allRows<StaffMember>((start, end) => workersQuery.order("id").range(start, end), "Could not load employees."),
      allRows<StaffRequest>((start, end) => requestsQuery.order("id").range(start, end), "Could not load employee requests."),
    ]);
    let bookings: Booking[] = [];
    // Worker records are restricted on the server, never merely hidden by the UI.
    if (session.role === "owner") {
      bookings = await allRows<Booking>((start, end) => db.from("bookings").select("*").order("created_at", { ascending: false }).order("id").range(start, end), "Could not load customers.");
    } else if (jobs.length) {
      const ids = Array.from(new Set(jobs.map(job => job.booking_id)));
      const assigned: Partial<Booking>[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        assigned.push(...await allRows<Partial<Booking>>((start, end) => db.from("bookings").select("id,first_name,last_name,apartment_complex,street_address,phone,car_make,car_model,car_color,license_plate,license_state,subscription_tier,status,service_day,scrape_by_time,weekly_schedule,notes").in("id", ids.slice(i, i + 200)).order("id").range(start, end), "Could not load assigned customer details."));
      }
      bookings = assigned.map(row => ({ ...row, subscription_frequency: "", payment_option: null, payment_status: "Unpaid", created_at: "" } as Booking));
    }
    return json({ session, bookings, workers, jobs, requests });
  });
}

import { ApiError, body, databaseError, jobFor, json, saveJob, serviceDate, staffApi, text, uuid } from "../_shared";

export async function POST(request: Request) {
  return staffApi(request, "owner", async (session, db) => {
    const data = await body(request);
    const bookingId = Number(data.booking_id);
    if (!Number.isSafeInteger(bookingId) || bookingId < 1) throw new ApiError(400, "Choose a customer.");
    const date = serviceDate(data.service_date);
    if ([0, 6].includes(new Date(date).getUTCDay())) throw new ApiError(400, "Regular service is available Monday through Friday.");
    const workerId = data.worker_id == null ? null : uuid(data.worker_id);
    if (workerId) {
      const result = await db.from("staff_members").select("id").eq("id", workerId).eq("active", true).maybeSingle();
      if (result.error) databaseError(result.error, "Could not check the selected employee.");
      if (!result.data) throw new ApiError(400, "Choose an active employee.");
    }
    const booking = await db.from("bookings").select("id,status").eq("id", bookingId).maybeSingle();
    if (booking.error) databaseError(booking.error, "Could not check this customer.");
    if (!booking.data || booking.data.status !== "Active") throw new ApiError(400, "Choose an active customer.");
    const existing = await db.from("service_jobs").select("*").eq("booking_id", bookingId).eq("service_date", date).maybeSingle();
    if (existing.error) databaseError(existing.error, "Could not check the existing schedule.");
    if (existing.data) {
      if (existing.data.status !== "pending") throw new ApiError(409, "A job that has already started cannot be reassigned.");
      await saveJob(db, existing.data, { worker_id: workerId });
      return json({ ok: true });
    }
    const result = await db.from("service_jobs").insert({ booking_id: bookingId, worker_id: workerId, service_date: date }).select("*").single();
    if (result.error) databaseError(result.error, "Could not schedule service.");
    return json({ ok: true, job: result.data }, 201);
  });
}

export async function PATCH(request: Request) {
  return staffApi(request, "either", async (session, db) => {
    const data = await body(request);
    const job = await jobFor(data.id, session, db);
    const action = data.action;
    if (session.role === "worker" && ["approve", "redo", "assign"].includes(String(action))) throw new ApiError(403, "Only the owner can assign or review jobs.");
    const notes = data.notes === undefined ? {} : { notes: text(data.notes, 1000, "visit notes", false) };
    if (session.role === "owner") {
      if (action === "assign") {
        if (job.status !== "pending") throw new ApiError(409, "Only jobs that have not started can be assigned.");
        const workerId = data.worker_id == null ? null : uuid(data.worker_id);
        if (workerId) {
          const result = await db.from("staff_members").select("id").eq("id", workerId).eq("active", true).maybeSingle();
          if (result.error) databaseError(result.error, "Could not check this employee.");
          if (!result.data) throw new ApiError(400, "Choose an active employee.");
        }
        await saveJob(db, job, { worker_id: workerId });
      } else if (action === "approve") {
        if (job.status !== "submitted" || !job.front_photo_path || !job.back_photo_path) throw new ApiError(409, "Only a submitted job with both photos can be approved.");
        await saveJob(db, job, { status: "completed", review_note: null });
      } else if (action === "redo") {
        if (job.status !== "submitted") throw new ApiError(409, "Only submitted jobs can be returned for a redo.");
        await saveJob(db, job, { status: "in_progress", completed_at: null, front_photo_path: null, back_photo_path: null, review_note: text(data.review_note, 1000, "a redo explanation") });
      } else throw new ApiError(400, "Unknown owner action.");
    } else if (action === "start") {
      if (job.status !== "pending") throw new ApiError(409, "This job has already started.");
      await saveJob(db, job, { ...notes, status: "in_progress", started_at: new Date().toISOString(), review_note: null });
    } else if (action === "submit") {
      if (job.status !== "in_progress" || !job.front_photo_path || !job.back_photo_path) throw new ApiError(409, "Start the job and upload both front and back photos before submitting.");
      await saveJob(db, job, { ...notes, status: "submitted", completed_at: new Date().toISOString() });
    } else if (action === "absent") {
      if (!["pending", "in_progress"].includes(job.status)) throw new ApiError(409, "This job has already been submitted.");
      await saveJob(db, job, { status: "absent", completed_at: new Date().toISOString(), notes: text(data.notes, 1000, "a missing-car explanation") });
    } else throw new ApiError(400, "Unknown employee action.");
    return json({ ok: true });
  });
}

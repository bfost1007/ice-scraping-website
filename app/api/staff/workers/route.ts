import { ApiError, body, databaseError, json, staffApi, text, uuid } from "../_shared";

export async function POST(request: Request) {
  return staffApi(request, "owner", async (_session, db) => {
    const data = await body(request);
    const name = text(data.name, 100, "an employee name");
    const email = text(data.email, 254, "an email address").toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400, "Please enter a valid employee email address.");
    if (typeof data.password !== "string" || data.password.length < 12 || data.password.length > 128) throw new ApiError(400, "Employee passwords must contain 12 to 128 characters.");
    const created = await db.auth.admin.createUser({ email, password: data.password, email_confirm: true });
    if (created.error || !created.data.user) throw new ApiError(400, "Could not create this employee account. Check the email and password, or whether the account already exists.");
    const id = created.data.user.id;
    const inserted = await db.from("staff_members").insert({ id, name, email, active: true });
    if (inserted.error) {
      await db.auth.admin.deleteUser(id);
      databaseError(inserted.error, "Could not save the employee profile. Check the staff database setup.");
    }
    return json({ ok: true }, 201);
  });
}
export async function PATCH(request: Request) {
  return staffApi(request, "owner", async (_session, db) => {
    const data = await body(request);
    if (typeof data.active !== "boolean") throw new ApiError(400, "Choose whether this employee is active.");
    const id = uuid(data.id);
    if (!data.active) {
      const open = await db.from("service_jobs").select("id").eq("worker_id", id).in("status", ["in_progress", "submitted"]).limit(1);
      if (open.error) databaseError(open.error, "Could not check this employee’s unfinished visits.");
      if (open.data?.length) throw new ApiError(409, "Finish and review this employee’s active visits before deactivating their account.");
    }
    const updated = await db.from("staff_members").update({ active: data.active }).eq("id", id).select("id").maybeSingle();
    if (updated.error) databaseError(updated.error, "Could not update this employee.");
    if (!updated.data) throw new ApiError(404, "Employee not found.");
    return json({ ok: true });
  });
}

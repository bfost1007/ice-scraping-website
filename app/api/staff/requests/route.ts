import { ApiError, body, databaseError, json, staffApi, text, uuid } from "../_shared";
export async function POST(request: Request) {
  return staffApi(request, "worker", async (session, db) => {
    const data = await body(request);
    if (!["supplies", "question", "issue"].includes(String(data.kind))) throw new ApiError(400, "Choose a request type.");
    const inserted = await db.from("staff_requests").insert({ worker_id: session.workerId!, kind: data.kind, message: text(data.message, 2000, "a request message") });
    if (inserted.error) databaseError(inserted.error, "Could not send this request.");
    return json({ ok: true }, 201);
  });
}
export async function PATCH(request: Request) {
  return staffApi(request, "owner", async (_session, db) => {
    const data = await body(request);
    if (typeof data.resolved !== "boolean") throw new ApiError(400, "Choose a request status.");
    const updated = await db.from("staff_requests").update({ resolved: data.resolved }).eq("id", uuid(data.id)).select("id").maybeSingle();
    if (updated.error) databaseError(updated.error, "Could not update this request.");
    if (!updated.data) throw new ApiError(404, "Request not found.");
    return json({ ok: true });
  });
}

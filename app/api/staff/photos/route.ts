import { ApiError, databaseError, jobFor, json, saveJob, staffApi } from "../_shared";

const BUCKET = "service-photos";
const MAX_PHOTO = 5 * 1024 * 1024;
function side(value: unknown): "front" | "back" {
  if (value !== "front" && value !== "back") throw new ApiError(400, "Choose the front or back photo.");
  return value;
}
function imageType(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "jpg";
  if (mime === "image/png" && [137, 80, 78, 71, 13, 10, 26, 10].every((x, i) => bytes[i] === x)) return "png";
  if (mime === "image/webp" && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "webp";
  throw new ApiError(400, "Upload a JPEG, PNG, or WebP photo.");
}
export async function POST(request: Request) {
  return staffApi(request, "either", async (session, db) => {
    if (Number(request.headers.get("content-length")) > MAX_PHOTO + 65536) throw new ApiError(413, "Photos must be 5 MB or smaller.");
    let form: FormData;
    try { form = await request.formData(); } catch { throw new ApiError(400, "Please select a photo to upload."); }
    const job = await jobFor(form.get("job_id"), session, db);
    if (!["pending", "in_progress"].includes(job.status)) throw new ApiError(409, "Photos cannot be changed after a job has been submitted.");
    const selectedSide = side(form.get("side"));
    const file = form.get("file");
    if (!(file instanceof File) || file.size < 12) throw new ApiError(400, "Please select a valid photo.");
    if (file.size > MAX_PHOTO) throw new ApiError(413, "Photos must be 5 MB or smaller.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const extension = imageType(bytes, file.type);
    const path = `${job.id}/${selectedSide}-${crypto.randomUUID()}.${extension}`;
    const upload = await db.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false, cacheControl: "60" });
    if (upload.error) throw new ApiError(503, "Photo storage is unavailable. Check the private service-photos bucket from supabase/staff-portal.sql.");
    const field = selectedSide === "front" ? "front_photo_path" : "back_photo_path";
    try { await saveJob(db, job, { [field]: path }); }
    catch (error) { await db.storage.from(BUCKET).remove([path]); throw error; }
    // Old files are removed only after the database has committed the replacement.
    const oldPath = job[field];
    if (oldPath?.startsWith(`${job.id}/`)) await db.storage.from(BUCKET).remove([oldPath]);
    return json({ ok: true });
  });
}
export async function GET(request: Request) {
  return staffApi(request, "either", async (session, db) => {
    const query = new URL(request.url).searchParams;
    const job = await jobFor(query.get("job_id"), session, db);
    const selectedSide = side(query.get("side"));
    const path = selectedSide === "front" ? job.front_photo_path : job.back_photo_path;
    if (!path || !path.startsWith(`${job.id}/`)) throw new ApiError(404, "This photo is not available.");
    const { data, error } = await db.storage.from(BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) databaseError(error, "Could not load this private photo.");
    return new Response(null, { status: 307, headers: { Location: data!.signedUrl, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  });
}

import { compressPhoto, MAX_PHOTO_BYTES } from "../../lib/photo-compression";
import type { Job } from "../../lib/staff-types";
import type { getDb } from "../../lib/staff-server";
import { ApiError, saveJob } from "./_shared";

const BUCKET = "service-photos";
type Db = ReturnType<typeof getDb>;
const PHOTO_NAME = /^(front|back)-[a-f0-9-]{36}\.(jpg|png|webp)$/;

// The approved filename retains the original key for idempotent cleanup retries.
// Never accept a client-supplied storage key or remove another job's photos.
function originalFor(jobId: string, path: string | null): string | null {
  if (!path?.startsWith(`${jobId}/`)) return null;
  const name = path.slice(jobId.length + 1);
  const match = /^(front|back)-approved-[a-f0-9-]{36}--(.+)\.webp$/.exec(name);
  if (!match || !PHOTO_NAME.test(match[2]) || !match[2].startsWith(`${match[1]}-`)) return null;
  return `${jobId}/${match[2]}`;
}

export async function cleanupApprovedPhotos(db: Db, job: Job): Promise<string | undefined> {
  const paths = [job.front_photo_path, job.back_photo_path].map(path => originalFor(job.id, path)).filter((path): path is string => !!path);
  if (!paths.length) return;
  try {
    const result = await db.storage.from(BUCKET).remove(paths);
    if (!result.error) return;
  } catch { /* Approval remains valid; originals are safe and cleanup can retry. */ }
  return "Approval saved, but some originals could not be deleted. Use Clean up original photos to retry.";
}

export async function approveWithCompressedPhotos(db: Db, job: Job): Promise<string | undefined> {
  const staged: string[] = [];
  const patch: Partial<Job> = { status: "completed", review_note: null };
  try {
    for (const side of ["front", "back"] as const) {
      const field = side === "front" ? "front_photo_path" : "back_photo_path";
      const source = job[field];
      const name = source?.slice(job.id.length + 1);
      if (!source?.startsWith(`${job.id}/`) || !name || !PHOTO_NAME.test(name) || !name.startsWith(`${side}-`)) throw new ApiError(409, "This job has an invalid photo reference. Request new photos before approval.");
      const original = await db.storage.from(BUCKET).download(source);
      if (original.error || !original.data || original.data.size > MAX_PHOTO_BYTES) throw new ApiError(503, "Could not read both original photos. Approval was not saved; originals were kept.");
      let compressed: Buffer | null;
      try { compressed = await compressPhoto(new Uint8Array(await original.data.arrayBuffer())); }
      catch { throw new ApiError(422, "A photo could not be processed. Originals were kept. Request a redo with valid photos before approving."); }
      if (!compressed) continue;
      const path = `${job.id}/${side}-approved-${crypto.randomUUID()}--${name}.webp`;
      staged.push(path);
      const uploaded = await db.storage.from(BUCKET).upload(path, compressed, { contentType: "image/webp", upsert: false, cacheControl: "60" });
      if (uploaded.error) throw new ApiError(503, "Could not save compressed photos. Approval was not saved; originals were kept.");
      const verified = await db.storage.from(BUCKET).download(path);
      if (verified.error || !verified.data || verified.data.size !== compressed.length || !Buffer.from(await verified.data.arrayBuffer()).equals(compressed)) throw new ApiError(503, "Could not verify compressed photos. Approval was not saved; originals were kept.");
      patch[field] = path;
    }
    // One optimistic update switches both paths and approves the job together.
    await saveJob(db, job, patch);
  } catch (error) {
    if (staged.length) {
      try { await db.storage.from(BUCKET).remove(staged); } catch { /* No original is ever removed on rollback. */ }
    }
    throw error;
  }
  return cleanupApprovedPhotos(db, { ...job, ...patch });
}

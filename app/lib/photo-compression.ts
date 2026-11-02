import sharp from "sharp";

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const APPROVED_PHOTO_EDGE = 2048;

// Rotate before stripping metadata, so portrait camera photos stay upright.
// Preserve already-small originals when re-encoding would consume more space.
export async function compressPhoto(input: Uint8Array): Promise<Buffer | null> {
  if (!input.length || input.length > MAX_PHOTO_BYTES) throw new Error("Invalid photo size.");
  const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "warning" });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) !== 1) throw new Error("A still JPEG, PNG, or WebP photo is required.");
  const output = await image.rotate().resize({ width: APPROVED_PHOTO_EDGE, height: APPROVED_PHOTO_EDGE, fit: "inside", withoutEnlargement: true }).webp({ quality: 85, effort: 4 }).toBuffer();
  return output.length < input.length ? output : null;
}

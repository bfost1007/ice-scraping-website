import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { compressPhoto, APPROVED_PHOTO_EDGE, MAX_PHOTO_BYTES } from '../app/lib/photo-compression.ts';

test('approved photos shrink, fit the size limit and lose camera metadata', async () => {
  const original = await sharp(randomBytes(2400 * 1000 * 3), { raw: { width: 2400, height: 1000, channels: 3 } }).png().withMetadata().toBuffer();
  // PNG noise exceeds the upload cap; use a valid, high-quality camera JPEG.
  const input = await sharp(original).jpeg({ quality: 100 }).withMetadata().toBuffer();
  assert.ok(input.length < MAX_PHOTO_BYTES);
  const compressed = await compressPhoto(input);
  assert.ok(compressed && compressed.length < input.length);
  const metadata = await sharp(compressed).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, APPROVED_PHOTO_EDGE);
  assert.ok(metadata.height <= APPROVED_PHOTO_EDGE);
  assert.equal(metadata.exif, undefined);
});

test('camera orientation is applied before metadata is removed', async () => {
  const input = await sharp({ create: { width: 120, height: 80, channels: 3, background: '#99aabb' } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const output = await compressPhoto(input);
  assert.ok(output);
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.width, 80); assert.equal(metadata.height, 120);
  assert.equal(metadata.orientation, undefined);
});

test('small images are not enlarged and larger re-encodings keep their original', async () => {
  const input = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).webp().toBuffer();
  assert.equal(await compressPhoto(input), null);
});

test('invalid and oversized images fail without generating a replacement', async () => {
  await assert.rejects(compressPhoto(Buffer.from('invalid image')));
  await assert.rejects(compressPhoto(Buffer.alloc(MAX_PHOTO_BYTES + 1)));
});

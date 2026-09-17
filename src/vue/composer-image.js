// composer-image.js — a pasted image, at the size worth sending.
//
// Split from the component for the reason the resize exists at all: this is the
// one step between the clipboard and the transcript that can silently produce
// something the API refuses, and it needs a canvas, so it cannot be checked in
// the same place as the rest of composer-attachments.js. Here it is one module
// with one entry point, which a browser can be pointed at.
//
// The base64 this returns goes into the `.jsonl` verbatim and never comes out
// again, so "send it as it arrived" is not the cheap option — a 6000px retina
// screenshot is several megabytes of transcript for detail the API discards on
// the way in.

import { fitWithin, isImageType, MAX_IMAGE_BYTES } from './composer-attachments.js';

/** A blob's bytes as base64, without the `data:` prefix the API does not take. */
function readAsBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('unreadable'));
    reader.onload = () => {
      const url = String(reader.result || '');
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Redraw an image at the size worth sending, or `null` if it already is that.
 *
 * Two reasons to re-encode, and the second is why the media type can change:
 * anything longer than MAX_IMAGE_EDGE is scaled down because the API scales it
 * anyway, and anything still over the byte cap after that is re-encoded as
 * JPEG, which is the only way a photograph-sized PNG ever gets under it.
 *
 * @returns {Promise<{ blob: Blob, mediaType: string } | null>}
 */
async function refit(file) {
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch { return null; }
  try {
    const fit = fitWithin(bitmap.width, bitmap.height);
    const oversize = fit.width !== bitmap.width || fit.height !== bitmap.height;
    if (!oversize && file.size <= MAX_IMAGE_BYTES) return null;

    const canvas = document.createElement('canvas');
    canvas.width = fit.width;
    canvas.height = fit.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, fit.width, fit.height);

    // Scaling alone usually brings a screenshot well under the cap and keeps it
    // lossless; JPEG is the fallback for what is still too big after it. A JPEG
    // is never re-encoded as PNG — that direction only makes the file larger.
    for (const mediaType of ['image/png', 'image/jpeg']) {
      if (mediaType === 'image/png' && file.type === 'image/jpeg') continue;
      const blob = await new Promise(done => canvas.toBlob(done, mediaType, 0.9));
      if (blob && blob.size <= MAX_IMAGE_BYTES) return { blob, mediaType };
    }
    return null;
  } finally {
    bitmap.close?.();
  }
}

/**
 * An image ready to attach, or `null` when it will not fit however it is
 * encoded — the caller says so rather than sending a prompt the API refuses.
 *
 * @returns {Promise<{ mediaType: string, bytes: number, data: string, url: string } | null>}
 */
export async function prepareImage(file) {
  // A canvas keeps one frame of an animated GIF, so a GIF is sent as it arrived
  // or not at all.
  const refitted = file.type === 'image/gif' ? null : await refit(file).catch(() => null);
  const blob = refitted?.blob || file;
  const mediaType = refitted?.mediaType || file.type;
  if (!isImageType(mediaType) || blob.size > MAX_IMAGE_BYTES) return null;
  const data = await readAsBase64(blob);
  return { mediaType, bytes: blob.size, data, url: `data:${mediaType};base64,${data}` };
}

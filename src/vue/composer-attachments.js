// composer-attachments.js — what the SDK chat's composer does with a file.
//
// Two things can be attached to a prompt, and they leave by different doors.
//
// An image travels *with* the message: the Messages API takes it as an `image`
// block, and that is already how the CLI records a pasted screenshot — the
// block first, the sentence after it, both in one user record. An image
// attached here therefore reads back out of the `.jsonl` as the same message it
// was sent as, with no WootonPad-shaped marker in the transcript.
//
// Anything else travels as a *reference*: `@path`, the same token the `@` menu
// writes and the same one the transcript already draws as a chip. The bytes
// stay on disk, which is where a file the session is working on belongs, and
// which is the only option at all for the ones too large to inline.
//
// DOM-free so it can be tested under `node --test`; the reading, decoding and
// resizing that needs a browser stays in the component.

/**
 * Media types the Messages API accepts as an `image` block. Anything else —
 * SVG, HEIC, a TIFF out of a scanner — is a file, and goes as a path.
 */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/**
 * Longest edge an attached image is scaled down to.
 *
 * The API resizes anything larger than this itself before the model sees it, so
 * sending a 6000px retina screenshot buys no detail — it only spends upload
 * time and transcript bytes. Doing it here also keeps the `.jsonl` readable:
 * the base64 goes into the file verbatim and never comes out again.
 */
export const MAX_IMAGE_EDGE = 1568;

/** Bytes of image data. 5MB *of base64* is the API's cap, and base64 is 4/3. */
export const MAX_IMAGE_BYTES = Math.floor((5 * 1024 * 1024 * 3) / 4);

export function isImageType(type) {
  return IMAGE_TYPES.includes(String(type || '').toLowerCase());
}

/**
 * The size to draw an image at so its longest edge is at most `max`.
 * Returns the original size when it already fits — the caller skips the
 * re-encode entirely in that case.
 */
export function fitWithin(width, height, max = MAX_IMAGE_EDGE) {
  const w = Math.max(1, Math.round(Number(width) || 0));
  const h = Math.max(1, Math.round(Number(height) || 0));
  const longest = Math.max(w, h);
  if (longest <= max) return { width: w, height: h };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

/**
 * The `@` token for a file on disk.
 *
 * Relative when the file is inside the project, because that is what the `@`
 * menu writes and what the session can resolve; absolute otherwise, which is
 * the only thing that can name a file in a sibling checkout or in `~`.
 */
export function mentionFor(absolutePath, projectPath) {
  const path = String(absolutePath || '');
  if (!path) return '';
  const root = String(projectPath || '').replace(/\/+$/, '');
  const inside = root && path.startsWith(`${root}/`);
  return `@${inside ? path.slice(root.length + 1) : path}`;
}

/** `document.pdf` from any of the shapes a path or a drop can arrive in. */
export function baseName(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : String(path || '');
}

/** "412 KB" — for a chip, where the exact byte count is noise. */
export function shortBytes(n) {
  const bytes = Number(n) || 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The prompt as the session will read it: what was typed, plus a mention per
 * attached file.
 *
 * Appended rather than inlined at the caret, because the chips are a list the
 * user assembled and the sentence is one they wrote; splicing paths into the
 * middle of it would rewrite what they said. A path the sentence already names
 * is skipped — typing `@src/app.js` and then dropping the same file is one
 * reference, not two.
 */
export function promptText(text, attachments) {
  const body = String(text || '').trim();
  const mentions = [];
  for (const item of attachments || []) {
    if (item?.kind !== 'file' || !item.mention) continue;
    if (body.includes(item.mention)) continue;
    if (!mentions.includes(item.mention)) mentions.push(item.mention);
  }
  if (!mentions.length) return body;
  return body ? `${body}\n\n${mentions.join('\n')}` : mentions.join('\n');
}

/**
 * What goes over the wire: a plain string when there is nothing but words, and
 * the Messages API block array when there is an image.
 *
 * A string is kept for the ordinary case on purpose — it is what every prompt
 * sent before this existed looked like, and the CLI's own handling of a bare
 * string prompt is the path with the most road behind it.
 *
 * @returns {string | Array<object>}
 */
export function promptContent(text, attachments) {
  const body = promptText(text, attachments);
  const images = (attachments || []).filter(a => a?.kind === 'image' && a.data);
  if (!images.length) return body;

  // Image first, sentence after: the order the CLI writes a pasted screenshot
  // into the transcript, so a prompt sent from here reads back as one of its own.
  const blocks = images.map(image => ({
    type: 'image',
    source: { type: 'base64', media_type: image.mediaType, data: image.data },
  }));
  if (body) blocks.push({ type: 'text', text: body });
  return blocks;
}

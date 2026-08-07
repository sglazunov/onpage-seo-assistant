// Generates the extension PNG icons without any image dependency: raw RGBA
// scanlines -> zlib deflate -> PNG chunks. Run via `npm run icons`.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const SIZES = [16, 32, 48, 128];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
  const stride = size * 4;
  // Each scanline is prefixed with filter type 0 (None).
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Smooth 0..1 coverage across a 1px band — cheap anti-aliasing. */
function coverage(distance, edge, softness) {
  const v = (edge - distance) / softness + 0.5;
  return Math.max(0, Math.min(1, v));
}

function blend(target, offset, r, g, b, alpha) {
  if (alpha <= 0) return;
  const inv = 1 - alpha;
  target[offset] = Math.round(target[offset] * inv + r * alpha);
  target[offset + 1] = Math.round(target[offset + 1] * inv + g * alpha);
  target[offset + 2] = Math.round(target[offset + 2] * inv + b * alpha);
  target[offset + 3] = Math.round(target[offset + 3] * inv + 255 * alpha);
}

/**
 * A rounded square in the brand gradient with a white magnifier: the glass ring
 * plus a handle running to the lower right.
 */
function drawIcon(size) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  const s = size / 128; // design is authored at 128px
  const radius = 26 * s;
  const soft = Math.max(0.8, 1.1 * s);

  const lensX = 54 * s;
  const lensY = 52 * s;
  const lensR = 27 * s;
  const ringW = 9 * s;

  const handleFrom = { x: 73 * s, y: 71 * s };
  const handleTo = { x: 100 * s, y: 98 * s };
  const handleW = 9 * s;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;
      const offset = (y * size + x) * 4;

      // Rounded-rect signed distance.
      const dx = Math.max(Math.abs(px - size / 2) - (size / 2 - radius), 0);
      const dy = Math.max(Math.abs(py - size / 2) - (size / 2 - radius), 0);
      const outside = Math.hypot(dx, dy) - radius;
      const bgAlpha = coverage(outside, 0, soft);
      if (bgAlpha <= 0) continue;

      // Diagonal gradient: indigo -> teal.
      const g = Math.min(1, Math.max(0, (px + py) / (2 * size)));
      const r0 = Math.round(37 + (13 - 37) * g);
      const g0 = Math.round(99 + (148 - 99) * g);
      const b0 = Math.round(235 + (136 - 235) * g);
      blend(pixels, offset, r0, g0, b0, bgAlpha);

      // Magnifier ring.
      const dLens = Math.abs(Math.hypot(px - lensX, py - lensY) - lensR);
      const ringAlpha = coverage(dLens, ringW / 2, soft) * bgAlpha;

      // Handle: distance to the capsule segment.
      const vx = handleTo.x - handleFrom.x;
      const vy = handleTo.y - handleFrom.y;
      const wx = px - handleFrom.x;
      const wy = py - handleFrom.y;
      const tRaw = (wx * vx + wy * vy) / (vx * vx + vy * vy);
      const tt = Math.max(0, Math.min(1, tRaw));
      const dHandle = Math.hypot(wx - vx * tt, wy - vy * tt);
      const handleAlpha = coverage(dHandle, handleW / 2, soft) * bgAlpha;

      const glyph = Math.max(ringAlpha, handleAlpha);
      if (glyph > 0) blend(pixels, offset, 255, 255, 255, glyph);
    }
  }

  return encodePng(size, pixels);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = resolve(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, drawIcon(size));
  console.log(`icon${size}.png`);
}

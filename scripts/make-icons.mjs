// Renders the EngageLens icon (a lens over chat bars) to public/icon/{16,32,48,128}.png.
// Dependency-free: rasterises with 4×4 supersampling and writes PNGs with zlib.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [42, 120, 214];
const WHITE = [255, 255, 255];

const roundedRect = (x, y, r) => {
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return dx * dx + dy * dy <= r * r;
};
const segmentDist = (px, py, ax, ay, bx, by) => {
  const t = Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
};

/** Colour at normalised (x, y), or null for transparent. */
function shade(x, y) {
  if (!roundedRect(x, y, 0.22)) return null;
  const cx = 0.44, cy = 0.44;
  const d = Math.hypot(x - cx, y - cy);
  if (d >= 0.2 && d <= 0.28) return WHITE; // lens ring
  if (segmentDist(x, y, 0.64, 0.64, 0.8, 0.8) <= 0.055) return WHITE; // handle
  const bars = [[0.34, 0.08], [0.44, 0.15], [0.54, 0.22]];
  for (const [bx, h] of bars) if (Math.abs(x - bx) <= 0.03 && y <= 0.55 && y >= 0.55 - h) return WHITE;
  return BG;
}

function render(size) {
  const ss = 4;
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sj = 0; sj < ss; sj++) {
        for (let si = 0; si < ss; si++) {
          const c = shade((i + (si + 0.5) / ss) / size, (j + (sj + 0.5) / ss) / size);
          if (c) {
            r += c[0]; g += c[1]; b += c[2]; a++;
          }
        }
      }
      const o = (j * size + i) * 4;
      if (a) {
        px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a);
      }
      px[o + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  return png(size, px);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const outDir = new URL('../public/icon/', import.meta.url);
mkdirSync(outDir, { recursive: true });
for (const size of [16, 32, 48, 128]) writeFileSync(new URL(`${size}.png`, outDir), render(size));
console.log('Icons written to public/icon/');

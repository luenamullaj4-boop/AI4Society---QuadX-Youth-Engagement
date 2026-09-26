// Generates the PWA PNG icons (192 and 512 px) without any image library.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function icon(size) {
  const green = [0x1e, 0x5a, 0x3f];
  const light = [0xbf, 0xe3, 0xcb];
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const r = size * 0.22;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      // rounded square mask
      const dx = Math.max(r - x, 0, x - (size - 1 - r));
      const dy = Math.max(r - y, 0, y - (size - 1 - r));
      const inside = dx * dx + dy * dy <= r * r;
      // leaf: intersection of two circles, plus a stem
      const cx = size / 2; const cy = size / 2;
      const a = (x - cx + size * 0.12) ** 2 + (y - cy + size * 0.12) ** 2 < (size * 0.3) ** 2;
      const b = (x - cx - size * 0.12) ** 2 + (y - cy - size * 0.12) ** 2 < (size * 0.3) ** 2;
      const stem = Math.abs((x - size * 0.3) - (size * 0.7 - y)) < size * 0.035 && x > size * 0.26 && x < size * 0.46;
      const col = a && b ? [255, 255, 255] : stem ? light : green;
      raw[i] = col[0]; raw[i + 1] = col[1]; raw[i + 2] = col[2]; raw[i + 3] = inside ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

[192, 512].forEach((s) => writeFileSync(new URL(`../public/img/icon-${s}.png`, import.meta.url), icon(s)));
console.log('Icons written to public/img/');

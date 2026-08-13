// 生成 PiSwitch 图标（build/icon.png + build/icon.ico），纯 Node 实现，无第三方依赖
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'build');

const SIZE = 256;
const px = new Uint8Array(SIZE * SIZE * 4);

function setPx(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

function inRoundRect(x, y, x0, y0, x1, y1, rad) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.max(x0 + rad, Math.min(x, x1 - rad));
  const cy = Math.max(y0 + rad, Math.min(y, y1 - rad));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= rad * rad;
}

function inTriangle(x, y, ax, ay, bx, by, cx, cy) {
  const s1 = (ax - x) * (by - ay) - (bx - ax) * (ay - y);
  const s2 = (bx - x) * (cy - by) - (cx - bx) * (by - y);
  const s3 = (cx - x) * (ay - cy) - (ax - cx) * (cy - y);
  const neg = s1 < 0 || s2 < 0 || s3 < 0;
  const pos = s1 > 0 || s2 > 0 || s3 > 0;
  return !(neg && pos);
}

// 背景：品牌蓝 → 冰蓝渐变圆角方块（呼应蓝色毛玻璃主题 + 雪花）
const rad = 56;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundRect(x, y, 6, 6, SIZE - 7, SIZE - 7, rad)) continue;
    const t = (x + y) / (2 * SIZE);
    const r = Math.round(15 + t * 52);
    const g = Math.round(111 + t * 63);
    const b = Math.round(235 + t * 17);
    setPx(x, y, r, g, b, 255);
  }
}

// 白色雪花：6 条主臂 + 侧枝 + 中心圆
const cx = SIZE / 2;
const cy = SIZE / 2;
const R = 100;
const white = [255, 255, 255];

function drawSegment(x1, y1, x2, y2, w, rgb) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) {
    setPx(Math.round(x1), Math.round(y1), rgb[0], rgb[1], rgb[2], 255);
    return;
  }
  const hw = w / 2;
  const minX = Math.floor(Math.min(x1, x2) - hw - 1);
  const maxX = Math.ceil(Math.max(x1, x2) + hw + 1);
  const minY = Math.floor(Math.min(y1, y2) - hw - 1);
  const maxY = Math.ceil(Math.max(y1, y2) + hw + 1);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const tt = ((x - x1) * dx + (y - y1) * dy) / (len * len);
      const tc = tt < 0 ? 0 : tt > 1 ? 1 : tt;
      const pxp = x1 + dx * tc;
      const pyp = y1 + dy * tc;
      const d = Math.hypot(x - pxp, y - pyp);
      if (d <= hw) setPx(x, y, rgb[0], rgb[1], rgb[2], 255);
    }
  }
}

for (let i = 0; i < 6; i++) {
  const a = -Math.PI / 2 + i * (Math.PI / 3);
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const sx = cx + ux * 16;
  const sy = cy + uy * 16;
  const ex = cx + ux * R;
  const ey = cy + uy * R;
  drawSegment(sx, sy, ex, ey, 7, white);
  for (const f of [0.52, 0.76]) {
    const bx = cx + ux * R * f;
    const by = cy + uy * R * f;
    const blen = R * 0.3;
    const ba = 0.85;
    drawSegment(bx, by, bx + Math.cos(a + ba) * blen, by + Math.sin(a + ba) * blen, 4.5, white);
    drawSegment(bx, by, bx + Math.cos(a - ba) * blen, by + Math.sin(a - ba) * blen, 4.5, white);
  }
}

// 中心圆
for (let y = -7; y <= 7; y++) {
  for (let x = -7; x <= 7; x++) {
    if (x * x + y * y <= 7 * 7) setPx(cx + x, cy + y, 255, 255, 255, 255);
  }
}

// ---------- PNG 编码 ----------
function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- ICO ----------
function encodeIco(png) {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  header[6] = 0; // width 256
  header[7] = 0; // height 256
  header[8] = 0; // colors
  header[9] = 0; // reserved
  header.writeUInt16LE(1, 10); // planes
  header.writeUInt16LE(32, 12); // bpp
  header.writeUInt32LE(png.length, 14); // bytes
  header.writeUInt32LE(22, 18); // offset
  return Buffer.concat([header, png]);
}

mkdirSync(OUT, { recursive: true });
// 最近邻 2x 放大到 512（mac 打包要求图标 >=512x512）；ico 保持 256 标准尺寸
function scale2x(src, srcSize) {
  const dst = new Uint8Array(srcSize * 2 * srcSize * 2 * 4);
  for (let y = 0; y < srcSize * 2; y++) {
    const sy = Math.floor(y / 2);
    for (let x = 0; x < srcSize * 2; x++) {
      const sx = Math.floor(x / 2);
      const si = (sy * srcSize + sx) * 4;
      const di = (y * srcSize * 2 + x) * 4;
      dst[di] = px[si];
      dst[di + 1] = px[si + 1];
      dst[di + 2] = px[si + 2];
      dst[di + 3] = px[si + 3];
    }
  }
  return dst;
}
const png512 = encodePng(SIZE * 2, SIZE * 2, Buffer.from(scale2x(px, SIZE)));
const png256 = encodePng(SIZE, SIZE, Buffer.from(px));
writeFileSync(join(OUT, 'icon.png'), png512);
writeFileSync(join(OUT, 'icon.ico'), encodeIco(png256));
console.log('icon generated:', join(OUT, 'icon.png'), png512.length, 'bytes (512x512) + icon.ico (256)');

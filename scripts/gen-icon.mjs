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

// 背景：深蓝→紫色渐变圆角方块
const rad = 56;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundRect(x, y, 6, 6, SIZE - 7, SIZE - 7, rad)) continue;
    const t = (x + y) / (2 * SIZE);
    const r = Math.round(24 + t * 40);
    const g = Math.round(38 + t * 30);
    const b = Math.round(110 + t * 120);
    setPx(x, y, r, g, b, 255);
  }
}

// 白/青色 ⇄ 双箭头（切换符号）
const cy = SIZE / 2;
const armY = 86; // 上箭头
const armY2 = 170; // 下箭头
const white = [240, 245, 255];
const accent = [90, 200, 250];

function drawArrow(yBase, dir) {
  // shaft
  for (let y = yBase - 14; y <= yBase + 14; y++) {
    for (let x = 44; x <= 168; x++) {
      const d = Math.abs(x - 106);
      const half = 26 - (Math.abs(y - yBase) * 26) / 18;
      if (d <= half) {
        const [r, g, b] = white;
        setPx(x, y, r, g, b);
      }
    }
  }
  // head triangles
  for (let y = yBase - 20; y <= yBase + 20; y++) {
    for (let x = 150; x <= 212; x++) {
      if (dir > 0 && inTriangle(x, y, 150, yBase - 20, 150, yBase + 20, 214, yBase)) {
        const [r, g, b] = accent;
        setPx(x, y, r, g, b);
      }
      if (dir < 0 && inTriangle(x, y, 106, yBase - 20, 106, yBase + 20, 42, yBase)) {
        const [r, g, b] = accent;
        setPx(x, y, r, g, b);
      }
    }
  }
}

drawArrow(armY, 1);
drawArrow(armY2, -1);

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

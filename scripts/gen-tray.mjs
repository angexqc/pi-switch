// 生成 PiSwitch 托盘图标（resources/tray.png，64x64），纯 Node 实现，无第三方依赖
// 图形：accent 青色圆角方块 + 白色双箭头（配置切换/中转语义），白色小圆角缺口
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'resources');

const SIZE = 64;
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

// 背景：品牌蓝 → 冰蓝渐变圆角方块（64px 托盘）
const rad = 15;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundRect(x, y, 3, 3, SIZE - 4, SIZE - 4, rad)) continue;
    const t = (x + y) / (2 * SIZE);
    const r = Math.round(15 + t * 52);
    const g = Math.round(111 + t * 63);
    const b = Math.round(235 + t * 17);
    setPx(x, y, r, g, b, 255);
  }
}

// 白色雪花（小尺寸简化）
const cx = SIZE / 2;
const cy = SIZE / 2;
const R = 27;
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
  const sx = cx + ux * 5;
  const sy = cy + uy * 5;
  const ex = cx + ux * R;
  const ey = cy + uy * R;
  drawSegment(sx, sy, ex, ey, 3, white);
  for (const f of [0.55, 0.78]) {
    const bx = cx + ux * R * f;
    const by = cy + uy * R * f;
    const blen = R * 0.32;
    const ba = 0.85;
    drawSegment(bx, by, bx + Math.cos(a + ba) * blen, by + Math.sin(a + ba) * blen, 2, white);
    drawSegment(bx, by, bx + Math.cos(a - ba) * blen, by + Math.sin(a - ba) * blen, 2, white);
  }
}

for (let y = -3; y <= 3; y++) {
  for (let x = -3; x <= 3; x++) {
    if (x * x + y * y <= 3 * 3) setPx(cx + x, cy + y, 255, 255, 255, 255);
  }
}

// 编码 PNG（RGBA → 过滤 → zlib → IHDR/IDAT/IEND）
function encodePng() {
  const stride = SIZE * 4;
  const raw = Buffer.alloc((stride + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    for (let x = 0; x < stride; x++) {
      raw[y * (stride + 1) + 1 + x] = px[y * stride + x];
    }
  }
  const idat = deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let crcTable;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'tray.png'), encodePng());
console.log('tray.png written:', join(OUT, 'tray.png'));

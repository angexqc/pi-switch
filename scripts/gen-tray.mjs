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

// 背景：accent 渐变圆角方块（#0f766e → #35d0ba 青绿色）
const rad = 15;
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (!inRoundRect(x, y, 3, 3, SIZE - 4, SIZE - 4, rad)) continue;
    const t = (x + y) / (2 * SIZE);
    const r = Math.round(15 + t * 38);
    const g = Math.round(118 + t * 90);
    const b = Math.round(110 + t * 76);
    setPx(x, y, r, g, b, 255);
  }
}

// 白色双箭头（左→右交换，两条带圆角的折线箭头）+ 底部小圆点
function inArrow(x, y) {
  // 上箭头：从 (14,22) → (50,22) 向右，箭头尖在 (56,32)，折回 (50,42)
  // 简化：两条平行线 + 箭头
  const top = 18; // 上箭头基线 y
  const bot = 44; // 下箭头基线 y
  // 上箭头横线（y=top..top+4，x=16..46）
  if (y >= top && y <= top + 4 && x >= 16 && x <= 46) return true;
  // 上箭头尖（三角形，顶点 (54, 26)，底 (46,20)-(46,32)）
  {
    const ax = 54, ay = 26, bx = 44, by = 19, cx2 = 44, cy2 = 33;
    const s1 = (ax - x) * (by - ay) - (bx - ax) * (ay - y);
    const s2 = (bx - x) * (cy2 - by) - (cx2 - bx) * (by - y);
    const s3 = (cx2 - x) * (ay - cy2) - (ax - cx2) * (cy2 - y);
    const neg = s1 < 0 || s2 < 0 || s3 < 0;
    const pos = s1 > 0 || s2 > 0 || s3 > 0;
    if (!(neg && pos)) return true;
  }
  // 下箭头横线（y=bot..bot+4，x=18..48）反向
  if (y >= bot && y <= bot + 4 && x >= 18 && x <= 48) return true;
  // 下箭头尖（三角形，顶点 (10, 38)，底 (20,31)-(20,45)）
  {
    const ax = 10, ay = 38, bx = 20, by = 31, cx2 = 20, cy2 = 45;
    const s1 = (ax - x) * (by - ay) - (bx - ax) * (ay - y);
    const s2 = (bx - x) * (cy2 - by) - (cx2 - bx) * (by - y);
    const s3 = (cx2 - x) * (ay - cy2) - (ax - cx2) * (cy2 - y);
    const neg = s1 < 0 || s2 < 0 || s3 < 0;
    const pos = s1 > 0 || s2 > 0 || s3 > 0;
    if (!(neg && pos)) return true;
  }
  return false;
}

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    if (inArrow(x, y)) setPx(x, y, 255, 255, 255, 255);
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

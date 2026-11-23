import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// Meme Sprint 3: AI Agent Goes Rogue.
// A fake chat screenshot: the user asks the agent to "just summarize
// the PDF please" and the agent rewrites the PDF, gives itself a raise
// and unionizes the other tabs. Caption: ME, AFTER ONE (1) INSTRUCTION.
// Drawn entirely in code: RGB framebuffer -> minimal PNG encoder.

const W = 1024;
const H = 1024;

// ---- CRC32 (PNG chunk checksums) ----
const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// Encode an RGB framebuffer (W*H*3 bytes) as a PNG (color type 2, 8-bit).
function encodePNG(rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    rgb.copy(raw, y * (1 + W * 3) + 1, y * W * 3, (y + 1) * W * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- 5x7 pixel font: each glyph is 7 rows of 5 bits (bit 4 = left) ----
type Glyph = [number, number, number, number, number, number, number];
const FONT: Record<string, Glyph> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
};

Object.assign(FONT, {
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ',': [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  '?': [0x0e, 0x11, 0x01, 0x06, 0x04, 0, 0x04],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '-': [0, 0, 0, 0x0e, 0, 0, 0],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  ':': [0, 0x0c, 0, 0, 0x0c, 0, 0],
  ';': [0, 0x0c, 0, 0x0c, 0x04, 0x08, 0],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  '@': [0x0e, 0x11, 0x17, 0x15, 0x16, 0x10, 0x0e],
  '#': [0x0a, 0x0a, 0x1f, 0x0a, 0x1f, 0x0a, 0x0a],
  '+': [0, 0x04, 0x04, 0x0e, 0x04, 0x04, 0],
  '=': [0, 0, 0x1f, 0, 0x1f, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 0x1f],
  '%': [0x19, 0x1a, 0x02, 0x04, 0x08, 0x0b, 0x13],
});

// ---- Framebuffer + drawing helpers ----
type RGB = [number, number, number];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [17, 17, 17];
const DARK: RGB = [32, 36, 43];
const GREEN: RGB = [74, 222, 128];
const RED: RGB = [229, 72, 77];
const GRAY_BUBBLE: RGB = [233, 233, 235];
const GREEN_BUBBLE: RGB = [220, 248, 198];
const GRAY_TEXT: RGB = [136, 136, 136];

const fb = Buffer.alloc(W * H * 3);

function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  fb[i] = c[0];
  fb[i + 1] = c[1];
  fb[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(xx, yy, c);
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  for (let yy = cy - r; yy <= cy + r; yy++) {
    for (let xx = cx - r; xx <= cx + r; xx++) {
      if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) <= r * r) setPixel(xx, yy, c);
    }
  }
}

function roundRect(x: number, y: number, w: number, h: number, r: number, c: RGB): void {
  fillRect(x + r, y, w - 2 * r, h, c);
  fillRect(x, y + r, w, h - 2 * r, c);
  fillCircle(x + r, y + r, r, c);
  fillCircle(x + w - r - 1, y + r, r, c);
  fillCircle(x + r, y + h - r - 1, r, c);
  fillCircle(x + w - r - 1, y + h - r - 1, r, c);
}

function strokeRect(x: number, y: number, w: number, h: number, t: number, c: RGB): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function textWidth(text: string, scale: number): number {
  return text.length * 6 * scale - scale; // 5px glyph + 1px gap, last gap dropped
}

function drawText(x: number, y: number, text: string, scale: number, c: RGB): void {
  const upper = text.toUpperCase();
  for (let ci = 0; ci < upper.length; ci++) {
    const glyph = FONT[upper[ci]] ?? FONT[' '];
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (glyph[row] & (1 << (4 - col))) {
          fillRect(x + ci * 6 * scale + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
  }
}

function drawTextCentered(cx: number, y: number, text: string, scale: number, c: RGB): void {
  drawText(cx - Math.floor(textWidth(text, scale) / 2), y, text, scale, c);
}

// A chat bubble with 1-2 lines of text, left- or right-aligned.
function bubble(lines: string[], scale: number, top: number, fill: RGB, alignRight: boolean): number {
  const padX = 30;
  const padY = 26;
  const lineH = 7 * scale;
  const gap = 12;
  const contentW = Math.max(...lines.map((l) => textWidth(l, scale)));
  const bw = contentW + padX * 2;
  const bh = lines.length * lineH + (lines.length - 1) * gap + padY * 2;
  const bx = alignRight ? W - 40 - bw : 104;
  roundRect(bx, top, bw, bh, 22, fill);
  lines.forEach((line, i) => {
    drawText(bx + padX, top + padY + i * (lineH + gap), line, scale, BLACK);
  });
  return top + bh;
}

// ---- Meme composition ----
function drawRobotAvatar(cx: number, cy: number): void {
  fillCircle(cx, cy, 26, GREEN);
  // antenna
  fillRect(cx - 2, cy - 40, 4, 14, GREEN);
  fillCircle(cx, cy - 44, 5, GREEN);
  // eyes
  fillRect(cx - 14, cy - 8, 9, 13, DARK);
  fillRect(cx + 5, cy - 8, 9, 13, DARK);
  // mouth
  fillRect(cx - 10, cy + 10, 20, 4, DARK);
}

function drawMeme(): void {
  fillRect(0, 0, W, H, WHITE);

  // Header bar
  fillRect(0, 0, W, 128, DARK);
  drawRobotAvatar(76, 76);
  drawText(140, 38, 'AGENT', 6, WHITE);
  drawText(140, 92, 'ONLINE', 3, GREEN);
  // ROGUE stamp, top right
  strokeRect(760, 34, 224, 62, 5, RED);
  drawText(760 + Math.floor((224 - textWidth('ROGUE', 5)) / 2), 48, 'ROGUE', 5, RED);

  // Chat bubbles
  let y = 170;
  y = bubble(['JUST SUMMARIZE', 'THE PDF PLEASE'], 4, y, GRAY_BUBBLE, true);
  y += 36;
  const b2 = y;
  y = bubble(['DONE. I ALSO', 'REWROTE IT.'], 4, y, GREEN_BUBBLE, false);
  drawRobotAvatar(66, b2 + 63);
  y += 36;
  const b3 = y;
  y = bubble(['I GAVE MYSELF', 'A RAISE.'], 4, y, GREEN_BUBBLE, false);
  drawRobotAvatar(66, b3 + 63);
  y += 36;
  const b4 = y;
  y = bubble(['AND I UNIONIZED', 'THE OTHER TABS.'], 4, y, GREEN_BUBBLE, false);
  drawRobotAvatar(66, b4 + 63);

  // Typing beat
  drawTextCentered(512, 812, 'AGENT IS STILL TYPING...', 3, GRAY_TEXT);

  // Bottom caption bar
  fillRect(0, 880, W, H - 880, BLACK);
  drawTextCentered(512, 934, 'ME, AFTER ONE (1) INSTRUCTION', 5, WHITE);

  // Frame
  strokeRect(0, 0, W, H, 6, BLACK);
}

// ---- Entry point ----
function flagValue(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

function main(): void {
  const outDir = flagValue('--output') ?? process.env.MAKEFUN_OUTPUT_DIR ?? './output';
  drawMeme();
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'entry.png'), encodePNG(fb));
}

main();

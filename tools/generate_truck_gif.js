/**
 * Generates Delivery Plus Animated Moving Truck GIF
 * Size: 700x240, Format: GIF89a (Loop infinite)
 * Produces crisp, crystal-clear graphics with exact color mapping
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const FONT_5X7 = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  'A': [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  'B': [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  'C': [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  'D': [0x1c, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1c],
  'E': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  'F': [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  'G': [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  'H': [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  'I': [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  'J': [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  'K': [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  'L': [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  'M': [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  'N': [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
  'O': [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  'P': [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  'Q': [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  'R': [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  'S': [0x0e, 0x11, 0x10, 0x0e, 0x01, 0x11, 0x0e],
  'T': [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  'U': [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  'V': [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  'W': [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  'X': [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  'Y': [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  'Z': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '&': [0x08, 0x14, 0x14, 0x08, 0x15, 0x12, 0x0d],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x06, 0x06],
  ',': [0x00, 0x00, 0x00, 0x00, 0x04, 0x04, 0x08],
  '-': [0x00, 0x00, 0x00, 0x1f, 0x00, 0x00, 0x00],
  '•': [0x00, 0x00, 0x0e, 0x0e, 0x0e, 0x00, 0x00],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
};

function drawText(rgba, W, H, str, startX, startY, scale, r, g, b) {
  let cx = startX;
  const upper = str.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    const bitmap = FONT_5X7[ch] || FONT_5X7[' '];
    for (let row = 0; row < 7; row++) {
      const bitRow = bitmap[row];
      for (let col = 0; col < 5; col++) {
        if ((bitRow >> (4 - col)) & 1) {
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const px = cx + col * scale + sx;
              const py = startY + row * scale + sy;
              if (px >= 0 && px < W && py >= 0 && py < H) {
                const idx = (py * W + px) * 4;
                rgba[idx] = r;
                rgba[idx + 1] = g;
                rgba[idx + 2] = b;
                rgba[idx + 3] = 255;
              }
            }
          }
        }
      }
    }
    cx += (5 + 1) * scale;
  }
}

class CrispGifEncoder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.rawFrames = [];
    this.delay = 6;
  }

  setDelay(ms) {
    this.delay = Math.round(ms / 10);
  }

  addRgbaFrame(rgba) {
    this.rawFrames.push(rgba);
  }

  encode() {
    // 1. Extract all unique colors across all frames
    const colorFrequency = new Map();
    for (const frame of this.rawFrames) {
      for (let i = 0; i < frame.length; i += 4) {
        // Quantize each channel to 5 bits for ultra-clean clustering
        const r = frame[i] & 0xf8;
        const g = frame[i + 1] & 0xf8;
        const b = frame[i + 2] & 0xf8;
        const key = (r << 16) | (g << 8) | b;
        colorFrequency.set(key, (colorFrequency.get(key) || 0) + 1);
      }
    }

    // Sort by frequency and take top 256
    const sorted = Array.from(colorFrequency.entries()).sort((a, b) => b[1] - a[1]);
    const palette = [];
    const paletteMap = new Map();

    for (let i = 0; i < Math.min(256, sorted.length); i++) {
      const key = sorted[i][0];
      const r = (key >> 16) & 0xff;
      const g = (key >> 8) & 0xff;
      const b = key & 0xff;
      palette.push([r, g, b]);
      paletteMap.set(key, i);
    }

    while (palette.length < 256) {
      palette.push([0, 0, 0]);
    }

    // Map each frame's pixels to palette
    const indexedFrames = [];
    for (const frame of this.rawFrames) {
      const indexed = new Uint8Array(this.width * this.height);
      for (let i = 0; i < indexed.length; i++) {
        const pi = i * 4;
        const r = frame[pi] & 0xf8;
        const g = frame[pi + 1] & 0xf8;
        const b = frame[pi + 2] & 0xf8;
        const key = (r << 16) | (g << 8) | b;

        if (paletteMap.has(key)) {
          indexed[i] = paletteMap.get(key);
        } else {
          // Find closest
          let bestDist = Infinity;
          let bestIdx = 0;
          for (let j = 0; j < palette.length; j++) {
            const pc = palette[j];
            const dist = (r - pc[0]) ** 2 + (g - pc[1]) ** 2 + (b - pc[2]) ** 2;
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = j;
            }
          }
          paletteMap.set(key, bestIdx);
          indexed[i] = bestIdx;
        }
      }
      indexedFrames.push(indexed);
    }

    const bytes = [];
    const push = (...b) => bytes.push(...b);
    const push16 = (val) => push(val & 0xff, (val >> 8) & 0xff);

    // GIF89a Header
    push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
    push16(this.width);
    push16(this.height);
    push(0xf7, 0x00, 0x00); // 256 colors GCT

    for (let i = 0; i < 256; i++) {
      const c = palette[i];
      push(c[0], c[1], c[2]);
    }

    // Netscape loop
    push(0x21, 0xff, 0x0b);
    push(...Array.from('NETSCAPE2.0', (ch) => ch.charCodeAt(0)));
    push(0x03, 0x01, 0x00, 0x00, 0x00);

    for (const indexed of indexedFrames) {
      push(0x21, 0xf9, 0x04);
      push(0x00); // Disposal
      push16(this.delay);
      push(0x00, 0x00);

      push(0x2c);
      push16(0);
      push16(0);
      push16(this.width);
      push16(this.height);
      push(0x00);

      const lzw = this.lzwEncode(indexed, 8);
      push(8);
      for (let i = 0; i < lzw.length; i += 254) {
        const chunk = lzw.slice(i, i + 254);
        push(chunk.length);
        push(...chunk);
      }
      push(0x00);
    }
    push(0x3b);
    return Buffer.from(bytes);
  }

  lzwEncode(pixels, minCodeSize) {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = clearCode + 2;

    const dict = new Map();
    const resetDict = () => {
      dict.clear();
      for (let i = 0; i < clearCode; i++) dict.set(String(i), i);
      codeSize = minCodeSize + 1;
      nextCode = clearCode + 2;
    };

    resetDict();
    const outputBits = [];
    const writeBits = (code, length) => {
      for (let i = 0; i < length; i++) outputBits.push((code >> i) & 1);
    };

    writeBits(clearCode, codeSize);
    let prefix = String(pixels[0]);
    for (let i = 1; i < pixels.length; i++) {
      const c = pixels[i];
      const key = `${prefix},${c}`;
      if (dict.has(key)) {
        prefix = key;
      } else {
        writeBits(dict.get(prefix), codeSize);
        if (nextCode < 4096) {
          dict.set(key, nextCode++);
          if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
        } else {
          writeBits(clearCode, codeSize);
          resetDict();
        }
        prefix = String(c);
      }
    }
    writeBits(dict.get(prefix), codeSize);
    writeBits(endCode, codeSize);

    const outBytes = [];
    for (let i = 0; i < outputBits.length; i += 8) {
      let b = 0;
      for (let bit = 0; bit < 8; bit++) {
        if (outputBits[i + bit]) b |= 1 << bit;
      }
      outBytes.push(b);
    }
    return outBytes;
  }
}

const W = 700;
const H = 240;
const encoder = new CrispGifEncoder(W, H);
encoder.setDelay(60); // 16 FPS

const numFrames = 20;

for (let f = 0; f < numFrames; f++) {
  const t = (f / numFrames) * 2;
  const rgba = new Uint8Array(W * H * 4);

  // 1. Sky & Road
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      if (y < 162) {
        // Clean Sky
        rgba[idx] = 232;
        rgba[idx + 1] = 246;
        rgba[idx + 2] = 252;
        rgba[idx + 3] = 255;
      } else {
        // Road (#171D29)
        rgba[idx] = 23;
        rgba[idx + 1] = 29;
        rgba[idx + 2] = 41;
        rgba[idx + 3] = 255;
      }
    }
  }

  // 2. City Skyline
  for (let i = -200; i < W + 200; i += 180) {
    const shift = (t * 20) % 180;
    const bx = Math.round(i - shift);
    for (let by = 70; by < 162; by++) {
      for (let bxw = 0; bxw < 45; bxw++) {
        const px = bx + bxw;
        if (px >= 0 && px < W) {
          const idx = (by * W + px) * 4;
          rgba[idx] = 214;
          rgba[idx + 1] = 231;
          rgba[idx + 2] = 242;
        }
      }
    }
  }

  // 3. Green Belt
  for (let y = 154; y < 162; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      rgba[idx] = 217;
      rgba[idx + 1] = 238;
      rgba[idx + 2] = 230;
    }
  }

  // 4. Moving Road Lane Markings (#FFD34D)
  const roadShift = Math.round((t * 260) % 120);
  for (let rx = -120; rx < W + 120; rx += 120) {
    const lineX = rx - roadShift;
    for (let ly = 205; ly < 210; ly++) {
      for (let lx = 0; lx < 72; lx++) {
        const px = lineX + lx;
        if (px >= 0 && px < W) {
          const idx = (ly * W + px) * 4;
          rgba[idx] = 255;
          rgba[idx + 1] = 211;
          rgba[idx + 2] = 77;
        }
      }
    }
  }

  // 5. Left Clean White Panel
  for (let y = 0; y < 162; y++) {
    for (let x = 0; x < 350; x++) {
      const idx = (y * W + x) * 4;
      rgba[idx] = 255;
      rgba[idx + 1] = 255;
      rgba[idx + 2] = 255;
    }
  }

  // 6. Fast & Secure Badge (#00B9E8)
  for (let by = 26; by < 46; by++) {
    for (let bx = 32; bx < 150; bx++) {
      const idx = (by * W + bx) * 4;
      rgba[idx] = 0;
      rgba[idx + 1] = 185;
      rgba[idx + 2] = 232;
    }
  }
  drawText(rgba, W, H, 'FAST & SECURE', 40, 32, 1.4, 255, 255, 255);

  // 7. Typography
  drawText(rgba, W, H, 'WE DELIVER MORE THAN', 32, 58, 2.2, 13, 27, 76);
  drawText(rgba, W, H, 'JUST YOUR ITEMS,', 32, 80, 2.2, 13, 27, 76);
  drawText(rgba, W, H, 'PEACE OF MIND.', 32, 102, 2.3, 0, 185, 232);
  drawText(rgba, W, H, 'PROFESSIONAL REMOVALS • RELIABLE TRANSIT', 32, 130, 1.2, 89, 103, 122);

  // 8. Moving Truck Drawing
  const bounce = Math.sin(t * 14) * 1.6;
  const truckX = 395;
  const truckY = Math.round(112 + bounce);

  // Headlight Beam
  for (let ly = truckY + 34; ly < truckY + 68; ly++) {
    for (let lx = truckX + 246; lx < Math.min(W, truckX + 380); lx++) {
      const prog = (lx - (truckX + 246)) / 134;
      const beamHeight = 4 + prog * 28;
      const beamCenter = truckY + 38 + prog * 16;
      if (Math.abs(ly - beamCenter) <= beamHeight / 2) {
        const idx = (ly * W + lx) * 4;
        rgba[idx] = 255;
        rgba[idx + 1] = 248;
        rgba[idx + 2] = 185;
      }
    }
  }

  // Cargo Box
  for (let cy = truckY - 22; cy < truckY + 48; cy++) {
    for (let cx = truckX; cx < truckX + 172; cx++) {
      if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
        const idx = (cy * W + cx) * 4;
        if (cx >= truckX + 6 && cx < truckX + 166 && cy >= truckY - 14 && cy < truckY + 40) {
          rgba[idx] = 13;
          rgba[idx + 1] = 27;
          rgba[idx + 2] = 76;
        } else {
          rgba[idx] = 255;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 255;
        }
      }
    }
  }

  // Cargo Box Text: "DELIVERY PLUS"
  drawText(rgba, W, H, 'DELIVERY', truckX + 14, truckY - 5, 1.8, 255, 255, 255);
  drawText(rgba, W, H, 'PLUS', truckX + 104, truckY - 5, 1.8, 0, 185, 232);
  drawText(rgba, W, H, 'TRUSTED TRANSIT', truckX + 14, truckY + 14, 1.0, 232, 248, 252);

  // Cyan Vertical Accent Separator
  for (let sy = truckY - 18; sy < truckY + 12; sy++) {
    for (let sx = truckX + 169; sx < truckX + 176; sx++) {
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
        const idx = (sy * W + sx) * 4;
        rgba[idx] = 0;
        rgba[idx + 1] = 185;
        rgba[idx + 2] = 232;
      }
    }
  }

  // Cab Body
  for (let cy = truckY - 6; cy < truckY + 48; cy++) {
    for (let cx = truckX + 172; cx < truckX + 246; cx++) {
      if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
        const idx = (cy * W + cx) * 4;
        if (cx >= truckX + 184 && cx < truckX + 236 && cy >= truckY && cy < truckY + 24) {
          rgba[idx] = 11;
          rgba[idx + 1] = 24;
          rgba[idx + 2] = 57;
        } else {
          rgba[idx] = 255;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 255;
        }
      }
    }
  }

  // Headlight Bulb
  for (let hy = truckY + 32; hy < truckY + 42; hy++) {
    for (let hx = truckX + 242; hx < truckX + 248; hx++) {
      if (hx >= 0 && hx < W && hy >= 0 && hy < H) {
        const idx = (hy * W + hx) * 4;
        rgba[idx] = 255;
        rgba[idx + 1] = 242;
        rgba[idx + 2] = 163;
      }
    }
  }

  // Wheels
  const wheelCenters = [truckX + 41, truckX + 75, truckX + 220];
  for (const wx of wheelCenters) {
    const wy = truckY + 54;
    for (let y = wy - 15; y <= wy + 15; y++) {
      for (let x = wx - 15; x <= wx + 15; x++) {
        const dist = Math.sqrt((x - wx) ** 2 + (y - wy) ** 2);
        if (dist <= 15 && x >= 0 && x < W && y >= 0 && y < H) {
          const idx = (y * W + x) * 4;
          if (dist > 9) {
            rgba[idx] = 23;
            rgba[idx + 1] = 29;
            rgba[idx + 2] = 39;
          } else if (dist > 3) {
            rgba[idx] = 203;
            rgba[idx + 1] = 214;
            rgba[idx + 2] = 224;
          } else {
            rgba[idx] = 0;
            rgba[idx + 1] = 185;
            rgba[idx + 2] = 232;
          }
        }
      }
    }
  }

  encoder.addRgbaFrame(rgba);
}

const gifBuffer = encoder.encode();
const publicDir = path.resolve(__dirname, '../../public/email-assets');
const uploadsDir = path.resolve(__dirname, '../uploads/email-assets');

if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

fs.writeFileSync(path.join(publicDir, 'deliveryplus-moving-truck.gif'), gifBuffer);
fs.writeFileSync(path.join(uploadsDir, 'deliveryplus-moving-truck.gif'), gifBuffer);

console.log(`Ultra-crisp animated GIF successfully created (${gifBuffer.length} bytes)!`);

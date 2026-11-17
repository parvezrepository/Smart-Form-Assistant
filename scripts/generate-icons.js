import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const iconsDir = path.resolve(__dirname, '../icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

/**
 * Calculates CRC32 for PNG chunks.
 */
function crc32(buffer) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }

  let crc = 0 ^ (-1);
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

/**
 * Builds a single PNG chunk.
 */
function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);

  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);

  return Buffer.concat([len, typeBuf, data, crc]);
}

/**
 * Generates an uncompressed RGBA PNG image buffer.
 */
function createIconPng(size) {
  const width = size;
  const height = size;

  // Each scanline begins with a filter type byte (0 = None), followed by width * 4 RGBA bytes.
  const rawScanlines = [];
  const radius = size * 0.44;
  const center = size / 2;

  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0; // Filter byte: 0 = None

    for (let x = 0; x < width; x++) {
      const offset = 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded square / badge calculation
      const cornerR = size * 0.22;
      const qx = Math.max(0, Math.abs(dx) - (center - cornerR));
      const qy = Math.max(0, Math.abs(dy) - (center - cornerR));
      const cornerDist = Math.sqrt(qx * qx + qy * qy);

      if (cornerDist <= cornerR) {
        // Gradient from indigo #4f46e5 (79, 70, 229) to cyan #06b6d4 (6, 182, 212)
        const t = (x + y) / (width + height);
        const r = Math.round(79 * (1 - t) + 6 * t);
        const g = Math.round(70 * (1 - t) + 182 * t);
        const b = Math.round(229 * (1 - t) + 212 * t);

        // Inner emblem (stylized "F" with a spark / dot)
        const innerX = (x - size * 0.28) / (size * 0.44);
        const innerY = (y - size * 0.28) / (size * 0.44);

        let isEmblem = false;
        // Vertical stem of 'F'
        if (innerX >= 0.1 && innerX <= 0.35 && innerY >= 0.1 && innerY <= 0.9) {
          isEmblem = true;
        }
        // Top bar of 'F'
        if (innerX >= 0.1 && innerX <= 0.85 && innerY >= 0.1 && innerY <= 0.32) {
          isEmblem = true;
        }
        // Mid bar of 'F'
        if (innerX >= 0.1 && innerX <= 0.65 && innerY >= 0.42 && innerY <= 0.6) {
          isEmblem = true;
        }
        // AI Sparkle in bottom right
        const sparkDx = x - (size * 0.72);
        const sparkDy = y - (size * 0.72);
        const sparkDist = Math.sqrt(sparkDx * sparkDx + sparkDy * sparkDy);
        if (sparkDist <= size * 0.14) {
          isEmblem = true;
        }

        if (isEmblem) {
          row[offset] = 255;     // R
          row[offset + 1] = 255; // G
          row[offset + 2] = 255; // B
          row[offset + 3] = 255; // A
        } else {
          row[offset] = r;
          row[offset + 1] = g;
          row[offset + 2] = b;
          row[offset + 3] = 255;
        }
      } else {
        // Transparent
        row[offset] = 0;
        row[offset + 1] = 0;
        row[offset + 2] = 0;
        row[offset + 3] = 0;
      }
    }
    rawScanlines.push(row);
  }

  const rawData = Buffer.concat(rawScanlines);
  const compressedData = zlib.deflateSync(rawData);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk: 13 bytes
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type (RGBA)
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressedData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const sizes = [16, 32, 48, 128];
for (const s of sizes) {
  const png = createIconPng(s);
  const targetPath = path.join(iconsDir, `icon${s}.png`);
  fs.writeFileSync(targetPath, png);
  console.log(`Generated icon${s}.png (${png.length} bytes)`);
}

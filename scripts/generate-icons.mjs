import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
const crc = (bytes) => { let value = 0xffffffff; for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([name, data]))); return Buffer.concat([size, name, data, sum]); };
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const BACKGROUND = [23, 23, 23, 255];
const CREAM = [247, 244, 238, 255];
const ARROW = [182, 58, 50, 255];

// Brand mark at fractional coordinates (0..1) so one geometry serves every size.
function pixelColor(nx, ny) {
  const cream =
    ny > 0.24 &&
    ny < 0.76 &&
    ((nx > 0.26 && nx < 0.34) || (nx > 0.66 && nx < 0.74) || Math.abs(nx - (0.3 + ny * 0.4)) < 0.045);
  const arrow =
    (nx > 0.53 && nx < 0.84 && Math.abs(ny - 0.5) < 0.045) ||
    (nx > 0.73 && nx < 0.85 && Math.abs(ny - 0.5) < (nx - 0.73) * 0.58);
  if (arrow) return ARROW;
  if (cream) return CREAM;
  return BACKGROUND;
}

// alpha=false writes an RGB PNG: App Store Connect rejects icons with an alpha channel.
function icon(size, alpha = true) {
  const channels = alpha ? 4 : 3;
  const rowLength = size * channels + 1; // one filter byte (0 = none) then the pixels
  const pixels = Buffer.alloc(size * rowLength);
  for (let y = 0; y < size; y++) {
    const row = y * rowLength;
    pixels[row] = 0;
    for (let x = 0; x < size; x++) {
      const offset = row + 1 + x * channels;
      const color = pixelColor(x / size, y / size);
      for (let channel = 0; channel < channels; channel++) pixels[offset + channel] = color[channel];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = alpha ? 6 : 2; // PNG colour type: 6 = RGBA, 2 = RGB
  return Buffer.concat([PNG_SIGNATURE, chunk("IHDR", header), chunk("IDAT", deflateSync(pixels)), chunk("IEND", Buffer.alloc(0))]);
}

const WEB_ICONS = [["icon-192.png", 192], ["icon-512.png", 512], ["maskable-512.png", 512]];
mkdirSync("public/icons", { recursive: true });
for (const [file, size] of WEB_ICONS) writeFileSync(`public/icons/${file}`, icon(size));

mkdirSync("native/assets", { recursive: true });
writeFileSync("native/assets/icon.png", icon(1024, false));

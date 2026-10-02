import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const output = process.argv[2] ?? 'packs/demo/assets/tilesets/colors.png';
const colors = [[91, 151, 83], [213, 185, 128], [64, 131, 182], [166, 82, 64], [225, 202, 156], [47, 99, 62], [120, 114, 105], [232, 187, 68]];
const width = 16 * colors.length, height = 16;
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
  size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}
const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
const pixels = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const color = colors[Math.floor(x / 16)]!;
  for (let channel = 0; channel < 3; channel++) pixels[y * (width * 3 + 1) + 1 + x * 3 + channel] = color[channel]!;
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]));

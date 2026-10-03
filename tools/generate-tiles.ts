import { writePng } from './png';
const output = process.argv[2] ?? 'packs/demo/assets/tilesets/colors.png';
const colors = [[91, 151, 83], [213, 185, 128], [64, 131, 182], [166, 82, 64], [225, 202, 156], [47, 99, 62], [120, 114, 105], [232, 187, 68]];
const width = 16 * colors.length, height = 16;
const pixels = Buffer.alloc(width * height * 3);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const color = colors[Math.floor(x / 16)]!;
  for (let channel = 0; channel < 3; channel++) pixels[(y * width + x) * 3 + channel] = color[channel]!;
}
writePng(output, width, height, 3, pixels);

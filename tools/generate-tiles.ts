import { writePng } from './png';
const output = process.argv[2] ?? 'packs/demo/assets/tilesets/colors.png';
const colors = process.argv[3] === 'manor' ? [[82, 63, 66], [44, 39, 55], [114, 77, 61], [156, 122, 69], [64, 90, 91], [119, 46, 66], [173, 155, 122], [35, 34, 46]] : process.argv[3] === 'house' ? [[192, 151, 111], [92, 64, 52]] : [[91, 151, 83], [213, 185, 128], [64, 131, 182], [166, 82, 64], [225, 202, 156], [47, 99, 62], [120, 114, 105], [232, 187, 68]];
const width = 16 * colors.length, height = 16;
const pixels = Buffer.alloc(width * height * 3);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const color = colors[Math.floor(x / 16)]!;
  for (let channel = 0; channel < 3; channel++) pixels[(y * width + x) * 3 + channel] = color[channel]!;
}
writePng(output, width, height, 3, pixels);

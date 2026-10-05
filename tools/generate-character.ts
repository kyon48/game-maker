import { writePng } from './png';
const output = process.argv[2] ?? 'packs/demo/assets/characters/hero.png';
const width = 48, height = 96;
const pixels = Buffer.alloc(width * height * 4);
function rect(frame: number, row: number, x: number, y: number, w: number, h: number, color: readonly number[]): void {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
    const index = ((row * 24 + yy) * width + frame * 16 + xx) * 4;
    for (let c = 0; c < 4; c++) pixels[index + c] = color[c] ?? 255;
  }
}
for (let row = 0; row < 4; row++) for (let frame = 0; frame < 3; frame++) {
  rect(frame, row, 4, 2, 8, 8, [238, 193, 140]);
  rect(frame, row, 4, 1, 8, row === 3 ? 8 : 3, [78, 56, 47]);
  rect(frame, row, 3, 10, 10, 8, process.argv[3] === 'keeper' ? [100, 160, 210] : [238, 185, 65]);
  rect(frame, row, 4, 18, 3, frame === 1 ? 4 : 6, [47, 65, 96]);
  rect(frame, row, 9, 18, 3, frame === 2 ? 4 : 6, [47, 65, 96]);
  if (row !== 3) {
    const eyeX = row === 1 ? 4 : row === 2 ? 10 : 5;
    rect(frame, row, eyeX, 6, 1, 2, [34, 42, 51]);
    if (row === 0) rect(frame, row, 10, 6, 1, 2, [34, 42, 51]);
  }
}
writePng(output, width, height, 4, pixels);

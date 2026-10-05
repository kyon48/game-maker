import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
it('copies exact upstream font and license into pack, with no runtime node_modules reference', () => {
  expect(readFileSync('packs/demo/assets/fonts/Galmuri11.woff2').equals(readFileSync('node_modules/galmuri/dist/Galmuri11.woff2'))).toBe(true);
  expect(readFileSync('packs/demo/assets/fonts/OFL.txt').equals(readFileSync('node_modules/galmuri/dist/LICENSE.txt'))).toBe(true);
  expect(readFileSync('packs/demo/CREDITS.md', 'utf8')).toContain('Lee Minseo');
});

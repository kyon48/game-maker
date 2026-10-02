import { expect, it, vi } from 'vitest';
import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { loadTiled, tileGid } from '../engine/data/loader/tiled';
import { drawTileMap } from '../engine/platform/renderer/tileMap';
import { camera } from '../engine/sim/world/Camera';

it('ignores all four Tiled flags, including 0x10000000', () => {
  expect(tileGid(0xf0000008)).toBe(8);
  expect(tileGid(0x10000000)).toBe(0);
});

it('floors fractional camera results, including small map centering and shake', () => {
  expect(camera({ x: 160.8, y: 120.9 }, { width: 480, height: 320 }, { width: 320, height: 240 })).toEqual({ x: 0, y: 0 });
  expect(camera({ x: 0, y: 0 }, { width: 159, height: 79 }, { width: 320, height: 240 }, { x: 0.2, y: -0.2 })).toEqual({ x: -81, y: -81 });
});

it('culls before reading tile data and never searches tilesets during render', async () => {
  const raw = JSON.parse(readFileSync('packs/demo/maps/village.tmj', 'utf8'));
  const map = await loadTiled({ readJson: async () => raw, exists: async () => true }, 'maps/village.tmj', 16);
  const reads: number[] = [];
  const data = new Proxy(new Array<number>(600).fill(1), {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) reads.push(Number(key));
      return Reflect.get(target, key, receiver);
    },
  });
  map.layers = [{ type: 'tilelayer', name: 'ground', width: 30, height: 20, data }];
  map.tilesets = new Proxy(map.tilesets, { get() { throw new Error('render searched tilesets'); } });
  const context = { canvas: { width: 32, height: 32 }, save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
  drawTileMap(context, map, new Map([['assets/tilesets/colors.png', {} as CanvasImageSource]]), { x: 16, y: 16 }, 'below');
  expect(reads).toEqual([31, 32, 61, 62]);
});

it('culls shifted layers with partial tiles on viewport edges', async () => {
  const raw = JSON.parse(readFileSync('packs/demo/maps/village.tmj', 'utf8'));
  const map = await loadTiled({ readJson: async () => raw, exists: async () => true }, 'maps/village.tmj', 16);
  map.layers = [{ type: 'tilelayer', name: 'ground', width: 30, height: 20, data: new Array<number>(600).fill(1), x: 1, y: 1, offsetx: 5, offsety: 7 }];
  const drawImage = vi.fn();
  const context = { canvas: { width: 32, height: 32 }, save: vi.fn(), restore: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D;
  drawTileMap(context, map, new Map([['assets/tilesets/colors.png', {} as CanvasImageSource]]), { x: 22, y: 24 }, 'below');
  expect(drawImage).toHaveBeenCalledTimes(9);
  expect(drawImage.mock.calls[0]?.slice(5, 7)).toEqual([-1, -1]);
});

it('enforces boundaries with ESLint cwd different from process cwd and repository root', async () => {
  const root = process.cwd();
  const eslint = new ESLint({ cwd: path.dirname(root), overrideConfigFile: path.join(root, 'eslint.config.js') });
  const results = await eslint.lintText("import { thing } from '../platform/thing';", { filePath: path.join(root, 'engine/sim/probe.ts') });
  expect(results.flatMap(result => result.messages).some(message => message.ruleId === 'architecture/boundary')).toBe(true);
});

it('detects a violation when the actual ESLint process starts in another cwd', () => {
  const root = process.cwd();
  const api = pathToFileURL(path.join(root, 'node_modules/eslint/lib/api.js')).href;
  const script = `
    import { ESLint } from ${JSON.stringify(api)};
    const eslint = new ESLint({ overrideConfigFile: ${JSON.stringify(path.join(root, 'eslint.config.js'))} });
    const results = await eslint.lintText("import type { Thing } from '../platform/thing';", {
      filePath: ${JSON.stringify(path.join(root, 'engine/sim/probe.ts'))}
    });
    console.log(JSON.stringify(results.flatMap(result => result.messages).map(message => message.ruleId)));
  `;
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: path.dirname(root), encoding: 'utf8' });
  expect(JSON.parse(output)).toContain('architecture/boundary');
});

import { afterEach, expect, it, vi } from 'vitest';
import { MapCache } from '../engine/data/loader/MapCache';
import { BrowserMapLoader } from '../engine/platform/mapLoader';
import type { EventDefinition } from '../engine/data/game';
const raw = () => ({ orientation: 'orthogonal', infinite: false, width: 2, height: 2, tilewidth: 16, tileheight: 16, layers: [], tilesets: [{ firstgid: 1, tilewidth: 16, tileheight: 16, columns: 1, tilecount: 1, image: '../assets/tiles.png' }] });
afterEach(() => vi.unstubAllGlobals());
it('MapCache deduplicates in-flight and completed maps, rejects unknown ids and retries failed requests', async () => {
  let failure = true;
  const readJson = vi.fn(async () => { if (failure) throw new Error('failed'); return raw(); });
  const cache = new MapCache({ readJson, exists: async () => true }, 16, new Map([['map', []]]));
  const a = cache.load('map'); expect(cache.load('map')).toBe(a); await expect(a).rejects.toThrow('failed');
  failure = false; const b = cache.load('map'); expect(b).not.toBe(a); await b;
  expect(cache.load('map')).toBe(b); expect(readJson).toHaveBeenCalledTimes(2);
  await expect(cache.load('unknown')).rejects.toThrow('Unknown map');
});
it('platform waits for new tileset and character decoding, caches maps/images and retries asset failure', async () => {
  const pending = new Map<string, { resolve: () => void; reject: (error: Error) => void }>();
  const decode = vi.fn(function (this: { src: string }) {
    return new Promise<void>((resolve, reject) => pending.set(this.src, { resolve, reject }));
  });
  vi.stubGlobal('Image', class { src = ''; decode = decode; });
  const definitions: EventDefinition[] = [{ id: 'npc', x: 1, y: 1, pages: [{ trigger: 'none', character: 'npc' }] }];
  const readJson = vi.fn(async () => raw());
  const cache = new MapCache({ readJson, exists: async () => true }, 16, new Map([['a', definitions], ['b', definitions]]));
  const loader = new BrowserMapLoader(cache, { npc: { sheet: 'assets/npc.png', frameWidth: 16, frameHeight: 24 } }, path => `/pack/${path}`);
  let resolved = false;
  const first = loader.load('a'); expect(loader.load('a')).toBe(first); void first.then(() => { resolved = true; });
  await vi.waitFor(() => expect(pending.size).toBe(2));
  expect(resolved).toBe(false); expect(loader.images.size).toBe(0);
  pending.get('/pack/assets/tiles.png')!.resolve(); await Promise.resolve(); expect(resolved).toBe(false);
  pending.get('/pack/assets/npc.png')!.resolve(); await first;
  expect(loader.images.size).toBe(2); expect(loader.load('a')).toBe(first);
  await loader.load('b'); expect(decode).toHaveBeenCalledTimes(2); expect(readJson).toHaveBeenCalledTimes(2);
  const failed = loader.image('assets/new.png'); pending.get('/pack/assets/new.png')!.reject(new Error('decode failed'));
  await expect(failed).rejects.toThrow('decode failed');
  const retry = loader.image('assets/new.png'); expect(retry).not.toBe(failed);
  pending.get('/pack/assets/new.png')!.resolve(); await retry;
});

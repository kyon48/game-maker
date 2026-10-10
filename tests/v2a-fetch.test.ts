import { afterEach, expect, it, vi } from 'vitest';
import { FetchSource } from '../engine/platform/fetchSource';
afterEach(() => vi.unstubAllGlobals());
it('optional pack JSON does not exist when an SPA server returns HTML fallback to HEAD', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 200, headers: { 'Content-Type': 'text/html' } })));
  expect(await new FetchSource('/pack/').exists('voices.json')).toBe(false);
});
it('JSON responses and real 404s preserve exists semantics', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('missing') ? new Response(null, { status: 404 }) : new Response(null, { headers: { 'Content-Type': 'application/json' } })));
  const source = new FetchSource('/pack/');
  expect(await source.exists('voice-manifest.json')).toBe(true);
  expect(await source.exists('missing.json')).toBe(false);
});

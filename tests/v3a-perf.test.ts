import { expect, it } from 'vitest';
import { encodeRgba } from '../engine/platform/frameTransport';
import { decodeRgba } from '../tools/film/frameTransport';
it('lossless compressed transport restores every RGBA byte, including alpha, with a much smaller payload', async () => {
  const rgba = new Uint8ClampedArray(1920 * 1080 * 4);
  for (let i = 0; i < rgba.length; i++) rgba[i] = i % 256;
  const encoded = await encodeRgba(rgba, 'deflate');
  expect(decodeRgba(encoded, 'deflate', rgba.length).equals(Buffer.from(rgba))).toBe(true);
  expect(encoded.length).toBeLessThan(rgba.length / 10);
});
it('keeps the raw transport compatible and rejects corrupt or incorrectly sized frames', async () => {
  const bytes = new Uint8ClampedArray([1, 2, 3, 255]);
  const encoded = await encodeRgba(bytes, 'rgba');
  expect(encoded).toBe('AQID/w=='); expect(decodeRgba(encoded, undefined, 4)).toEqual(Buffer.from(bytes));
  expect(() => decodeRgba(encoded, undefined, 8)).toThrow('size');
  expect(() => decodeRgba(encoded, 'deflate', 4)).toThrow();
  const compressed = await encodeRgba(bytes, 'deflate');
  expect(() => decodeRgba(compressed, 'deflate', 3)).toThrow();
});

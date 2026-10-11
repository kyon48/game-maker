import { inflateSync } from 'node:zlib';
/** Tools only decode browser pixels; no resampling or alpha compositing occurs here. */
export function decodeRgba(encoded: string, encoding: 'rgba' | 'deflate' | undefined, length: number): Buffer {
  const payload = Buffer.from(encoded, 'base64');
  const bytes = encoding === 'deflate' ? inflateSync(payload, { maxOutputLength: length }) : payload;
  if (bytes.length !== length) throw new Error('Incorrect RGBA frame size');
  return bytes;
}

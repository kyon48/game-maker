export type FrameEncoding = 'rgba' | 'deflate';
function base64(bytes: Uint8Array | Uint8ClampedArray): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
/** Compress after browser compositing: decoded bytes remain exactly getImageData RGBA. */
export async function encodeRgba(bytes: Uint8ClampedArray<ArrayBuffer>, encoding: FrameEncoding): Promise<string> {
  if (encoding === 'rgba') return base64(bytes);
  const stream = new CompressionStream('deflate');
  // Consume concurrently to avoid readable-side backpressure blocking the writer.
  const result = new Response(stream.readable).arrayBuffer();
  const writer = stream.writable.getWriter();
  await writer.write(bytes); await writer.close();
  return base64(new Uint8Array(await result));
}

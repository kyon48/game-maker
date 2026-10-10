import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Id } from './schema/primitives';
import type { Skin } from './skin';
export const PortraitsSchema = Type.Record(Id, Type.Record(Id, Type.String({ pattern: '^assets/portraits/[^\\\\]+\\.png$' }), { additionalProperties: false }), { additionalProperties: false });
export type Portraits = Static<typeof PortraitsSchema>;
export function portraitSlot(skin?: Skin): { width: number; gap: number } {
  return { width: skin?.portrait?.width ?? 56, gap: skin?.portrait?.gap ?? 4 };
}
export function portraitFiles(portraits: Portraits): string[] {
  return [...new Set(Object.values(portraits).flatMap(expressions => Object.values(expressions)))].sort();
}
/** PNG IHDR metadata, shared by Node and browser validation without DOM. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || signature.some((value, i) => bytes[i] !== value) || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR') throw new Error('Unreadable PNG dimensions');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (view.getUint32(8) !== 13 || !width || !height) throw new Error('Invalid PNG dimensions');
  return { width, height };
}

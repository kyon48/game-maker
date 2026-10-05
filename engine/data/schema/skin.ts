import { Type } from '@sinclair/typebox';
import { Positive, Nonnegative, objectOptions } from './primitives';
export const SkinSchema = Type.Object({
  font: Type.Object({ family: Type.String({ minLength: 1 }), src: Type.String({ minLength: 1 }), size: Positive, lineHeight: Positive }, objectOptions),
  window: Type.Object({ image: Type.Optional(Type.String({ minLength: 1 })), slice: Positive, padding: Nonnegative }, objectOptions),
  colors: Type.Object({ text: Type.String(), speaker: Type.String(), cursor: Type.String(), fade: Type.String() }, objectOptions),
  message: Type.Object({ rows: Positive, charsPerTick: Positive }, objectOptions),
}, objectOptions);

import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Nonnegative, objectOptions } from './schema/primitives';
const coordinate = Type.Number();
export const DrawListSchema = Type.Array(Type.Union([
  Type.Object({ kind: Type.Literal('rect'), x: coordinate, y: coordinate, w: coordinate, h: coordinate, color: Type.String() }, objectOptions),
  Type.Object({ kind: Type.Literal('image'), asset: Type.String(), x: coordinate, y: coordinate, frame: Type.Optional(Nonnegative) }, objectOptions),
  Type.Object({ kind: Type.Literal('text'), x: coordinate, y: coordinate, text: Type.String(), color: Type.Optional(Type.String()), align: Type.Optional(Type.Union([Type.Literal('left'), Type.Literal('center')])) }, objectOptions),
  Type.Object({ kind: Type.Literal('window'), x: coordinate, y: coordinate, w: coordinate, h: coordinate }, objectOptions),
]));
export type DrawList = Static<typeof DrawListSchema>;
export type DrawCommand = DrawList[number];
export const EndingArgs = Type.Object({ title: Type.String(), lines: Type.Array(Type.String()), image: Type.Optional(Type.String()) }, objectOptions);

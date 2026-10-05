import { Type } from '@sinclair/typebox';
import { Nonnegative, Positive, SafeInteger } from './primitives';
export const TilesetSchema = Type.Object({ image: Type.String(), tilewidth: Positive, tileheight: Positive, tilecount: Positive, columns: Positive,
  margin: Type.Optional(Nonnegative), spacing: Type.Optional(Nonnegative) }, { additionalProperties: true });
export const TileLayerSchema = Type.Object({ type: Type.Literal('tilelayer'), name: Type.String(), width: Positive, height: Positive,
  data: Type.Array(Type.Integer({ minimum: 0, maximum: 0xffffffff })), visible: Type.Optional(Type.Boolean()), opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  x: Type.Optional(SafeInteger), y: Type.Optional(SafeInteger), offsetx: Type.Optional(Type.Number()), offsety: Type.Optional(Type.Number()) }, { additionalProperties: true });
export const ObjectLayerSchema = Type.Object({ type: Type.Literal('objectgroup'), name: Type.String(), objects: Type.Array(Type.Object({
  name: Type.String(), point: Type.Optional(Type.Boolean()), x: Type.Number(), y: Type.Number(),
}, { additionalProperties: true })) }, { additionalProperties: true });
export const TiledSchema = Type.Object({ orientation: Type.String(), infinite: Type.Boolean(), width: Positive, height: Positive, tilewidth: Positive, tileheight: Positive,
  layers: Type.Array(Type.Union([TileLayerSchema, ObjectLayerSchema, Type.Object({ type: Type.Literal('group'), name: Type.String(), layers: Type.Array(Type.Unknown()) }, { additionalProperties: true })])),
  tilesets: Type.Array(Type.Union([Type.Object({ firstgid: Positive, source: Type.String() }, { additionalProperties: true }),
    Type.Object({ ...TilesetSchema.properties, firstgid: Positive }, { additionalProperties: true })])) }, { additionalProperties: true });

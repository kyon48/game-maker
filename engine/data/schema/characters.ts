import { Type } from '@sinclair/typebox';
import { Id, Positive, Nonnegative, objectOptions } from './primitives';
export const CharacterSchema = Type.Union([
  Type.Object({ placeholder: Type.String({ minLength: 1 }), sheet: Type.Optional(Type.Never()), moveTicks: Type.Optional(Positive) }, objectOptions),
  Type.Object({ sheet: Type.String({ minLength: 1 }), placeholder: Type.Optional(Type.Never()), frameWidth: Positive, frameHeight: Positive, moveTicks: Type.Optional(Positive),
    rows: Type.Optional(Type.Object({ down: Nonnegative, left: Nonnegative, right: Nonnegative, up: Nonnegative }, objectOptions)),
    walkFrames: Type.Optional(Type.Array(Nonnegative, { minItems: 1 })), frameTicks: Type.Optional(Positive) }, objectOptions),
]);
export const CharactersSchema = Type.Record(Id, CharacterSchema, objectOptions);

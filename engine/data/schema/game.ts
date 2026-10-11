import { Type } from '@sinclair/typebox';
import { DirSchema, Id, Positive, SafeInteger, Nonnegative, objectOptions } from './primitives';
export const CURRENT_FORMAT_VERSION = 1;
export const InitialStateSchema = Type.Object({ items: Type.Optional(Type.Record(Id, Nonnegative, objectOptions)), flags: Type.Record(Id, Type.Boolean(), objectOptions), vars: Type.Record(Id, SafeInteger, objectOptions) }, objectOptions);
export const StartSchema = Type.Object({ map: Id, x: SafeInteger, y: SafeInteger, dir: DirSchema }, objectOptions);
export const GameSchema = Type.Object({ $schema: Type.Optional(Type.String()), id: Id, title: Type.String({ minLength: 1 }),
  version: Type.String({ pattern: '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$' }), formatVersion: Positive,
  tileSize: Positive, screen: Type.Object({ width: Positive, height: Positive }, objectOptions), maps: Type.Array(Id, { minItems: 1, uniqueItems: true }),
  start: StartSchema, player: Id, plugins: Type.Array(Id, { uniqueItems: true }), labels: Type.Object({ itemGet: Type.Optional(Type.String({ minLength: 1, pattern: "\\S" })), menuItems: Type.Optional(Type.String({ minLength: 1, pattern: "\\S" })), menuClues: Type.Optional(Type.String({ minLength: 1, pattern: "\\S" })), menuClose: Type.Optional(Type.String({ minLength: 1, pattern: "\\S" })), menuEmpty: Type.Optional(Type.String({ minLength: 1, pattern: "\\S" })), continue: Type.String({ minLength: 1 }), newGame: Type.String({ minLength: 1 }) }, objectOptions),
  mapBgm: Type.Optional(Type.Record(Id, Id, objectOptions)),
  mapNames: Type.Optional(Type.Record(Id, Type.String({ minLength: 1 }), objectOptions)),
  state: InitialStateSchema }, objectOptions);

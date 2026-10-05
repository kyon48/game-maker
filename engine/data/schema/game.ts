import { Type } from '@sinclair/typebox';
import { DirSchema, Id, Positive, SafeInteger, objectOptions } from './primitives';
export const CURRENT_FORMAT_VERSION = 1;
export const InitialStateSchema = Type.Object({ flags: Type.Record(Id, Type.Boolean(), objectOptions), vars: Type.Record(Id, SafeInteger, objectOptions) }, objectOptions);
export const StartSchema = Type.Object({ map: Id, x: SafeInteger, y: SafeInteger, dir: DirSchema }, objectOptions);
export const GameSchema = Type.Object({ $schema: Type.Optional(Type.String()), id: Id, title: Type.String({ minLength: 1 }),
  version: Type.String({ pattern: '^(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\\+[0-9A-Za-z.-]+)?$' }), formatVersion: Positive,
  tileSize: Positive, screen: Type.Object({ width: Positive, height: Positive }, objectOptions), maps: Type.Array(Id, { minItems: 1, uniqueItems: true }),
  start: StartSchema, player: Id, plugins: Type.Array(Id, { uniqueItems: true }), labels: Type.Object({ continue: Type.String({ minLength: 1 }), newGame: Type.String({ minLength: 1 }) }, objectOptions),
  state: InitialStateSchema }, objectOptions);

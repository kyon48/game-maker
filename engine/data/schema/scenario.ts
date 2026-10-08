import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { DirSchema, Id, Nonnegative, Positive, SafeInteger, objectOptions } from './primitives';
import { ConditionSchema } from './events';
import { StartSchema } from './game';
export const ActionSchema = Type.Union([Type.Literal('up'), Type.Literal('down'), Type.Literal('left'), Type.Literal('right'), Type.Literal('ok'), Type.Literal('cancel')]);
export const SaveExpectSchema = Type.Union([ConditionSchema, Type.Object({ self: Id, is: Type.Boolean(), map: Id, event: Id }, objectOptions)]);
const expected = Type.Union([
  ConditionSchema, Type.Object({ self: Id, is: Type.Boolean(), map: Id, event: Id }, objectOptions),
  Type.Object({ map: Id, x: Type.Optional(SafeInteger), y: Type.Optional(SafeInteger), dir: Type.Optional(DirSchema) }, objectOptions),
  Type.Object({ textContains: Type.String() }, objectOptions),
]);
export const ScenarioSchema = Type.Object({ name: Type.String({ minLength: 1 }), start: Type.Optional(StartSchema), state: Type.Optional(Type.Object({ flags: Type.Optional(Type.Record(Id, Type.Boolean(), objectOptions)), vars: Type.Optional(Type.Record(Id, SafeInteger, objectOptions)) }, objectOptions)),
  steps: Type.Array(Type.Union([
    Type.Object({ press: ActionSchema }, objectOptions), Type.Object({ hold: ActionSchema, frames: Positive }, objectOptions),
    Type.Object({ wait: Nonnegative }, objectOptions), Type.Object({ walk: Type.Array(DirSchema) }, objectOptions),
    Type.Object({ advanceText: Type.Literal(true) }, objectOptions), Type.Object({ choose: Nonnegative }, objectOptions),
    Type.Object({ settle: Type.Literal(true) }, objectOptions),
    Type.Object({ reload: Type.Literal(true) }, objectOptions),
    Type.Object({ expectSave: SaveExpectSchema }, objectOptions), Type.Object({ expect: expected }, objectOptions),
  ])) }, objectOptions);

export type SaveExpect = Static<typeof SaveExpectSchema>;

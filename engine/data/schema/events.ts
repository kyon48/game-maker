import { RouteSchema } from './routes';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { DirSchema, Id, SafeInteger, objectOptions } from './primitives';
export const ConditionSchema = Type.Recursive(Self => Type.Union([
  Type.Object({ flag: Id, is: Type.Boolean() }, objectOptions),
  Type.Object({ var: Id, op: Type.Union([Type.Literal('=='), Type.Literal('!='), Type.Literal('>'), Type.Literal('>='), Type.Literal('<'), Type.Literal('<=')]), value: SafeInteger }, objectOptions),
  Type.Object({ self: Id, is: Type.Boolean() }, objectOptions),
  Type.Object({ all: Type.Array(Self) }, objectOptions), Type.Object({ any: Type.Array(Self) }, objectOptions),
  Type.Object({ not: Self }, objectOptions),
  Type.Object({ plugin: Type.String({ pattern: '^x_[a-z0-9_]+$' }), args: Type.Record(Type.String(), Type.Unknown()) }, objectOptions),
]), { $id: 'Condition' });
export const CommandSchema = Type.Object({ cmd: Type.String() }, { $id: 'Command', additionalProperties: true });
export type Command = Static<typeof CommandSchema> & Record<string, unknown>;
export const CommandRef = Type.Unsafe<Command>(Type.Ref('Command'));
export const ConditionRef = Type.Unsafe<Static<typeof ConditionSchema>>(Type.Ref('Condition'));
export const PageSchema = Type.Object({ character: Type.Optional(Id), dir: Type.Optional(DirSchema), through: Type.Optional(Type.Boolean()), wander: Type.Optional(RouteSchema), when: Type.Optional(ConditionRef),
  trigger: Type.Union([Type.Literal('action'), Type.Literal('touch'), Type.Literal('auto'), Type.Literal('parallel'), Type.Literal('none')]), commands: Type.Optional(Type.Array(CommandRef)) }, objectOptions);
export const EventSchema = Type.Object({ id: Id, x: SafeInteger, y: SafeInteger, pages: Type.Array(PageSchema, { minItems: 1 }) }, objectOptions);
export const EventsSchema = Type.Object({ $schema: Type.Optional(Type.String()), events: Type.Array(EventSchema) }, objectOptions);
export const CommonEventsSchema = Type.Record(Id, Type.Object({ commands: Type.Array(CommandRef) }, objectOptions), objectOptions);

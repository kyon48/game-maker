import { Id } from '../../data/schema/primitives';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ map: Id, marker: Type.Optional(Id), x: Type.Optional(Type.Integer()), y: Type.Optional(Type.Integer()), dir: Type.Optional(Type.Union([Type.Literal('up'), Type.Literal('down'), Type.Literal('left'), Type.Literal('right')])), fade: Type.Optional(Type.Boolean()) }, { additionalProperties: false });
export function registerTransfer(registry: CommandRegistry): void {
  registry.register('transfer', {
    args: argsSchema,
    parallelSafe: false,
    *run(args, ctx) {
      yield* ctx.transfer(args);
    },
  });
}

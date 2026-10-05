import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerTransfer(registry: CommandRegistry): void {
  registry.register('transfer', {
    args: Type.Object({ map: Type.String(), marker: Type.Optional(Type.String()), x: Type.Optional(Type.Integer()), y: Type.Optional(Type.Integer()), dir: Type.Optional(Type.Union([Type.Literal('up'), Type.Literal('down'), Type.Literal('left'), Type.Literal('right')])), fade: Type.Optional(Type.Boolean()) }, { additionalProperties: false }),
    parallelSafe: false,
    *run(args, ctx) {
      if (args.marker !== undefined ? args.x !== undefined || args.y !== undefined : args.x === undefined || args.y === undefined) throw new Error('Transfer requires marker or x/y');
      yield* ctx.transfer(args);
    },
  });
}

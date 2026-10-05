import { Id, SafeInteger } from '../../data/schema/primitives';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ var: Id, op: Type.Optional(Type.Union([Type.Literal('set'), Type.Literal('add'), Type.Literal('sub')])), value: SafeInteger }, { additionalProperties: false });
export function registerSetVar(registry: CommandRegistry): void {
  registry.register('set_var', {
    args: argsSchema,
    parallelSafe: true,
    run(args, ctx) {
      const before = ctx.state.getVar(args.var);
      const value = args.op === 'add' ? before + args.value : args.op === 'sub' ? before - args.value : args.value;
      ctx.state.setVar(args.var, value);
    },
  });
}

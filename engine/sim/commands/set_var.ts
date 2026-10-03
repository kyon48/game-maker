import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerSetVar(registry: CommandRegistry): void {
  registry.register('set_var', {
    args: Type.Object({ var: Type.String(), op: Type.Optional(Type.Union([Type.Literal('set'), Type.Literal('add'), Type.Literal('sub')])), value: Type.Integer() }, { additionalProperties: false }),
    parallelSafe: true,
    run(args, ctx) {
      if (!Number.isSafeInteger(args.value)) throw new Error('Unsafe variable operand');
      const before = ctx.state.getVar(args.var);
      const value = args.op === 'add' ? before + args.value : args.op === 'sub' ? before - args.value : args.value;
      ctx.state.setVar(args.var, value);
    },
  });
}

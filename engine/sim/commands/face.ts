import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerFace(registry: CommandRegistry): void {
  registry.register('face', {
    args: Type.Object({ target: Type.String(), dir: Type.Union([Type.Literal('up'), Type.Literal('down'), Type.Literal('left'), Type.Literal('right'), Type.Literal('player')]) }, { additionalProperties: false }),
    parallelSafe: true,
    run(args, ctx) { ctx.face(args.target, args.dir); },
  });
}

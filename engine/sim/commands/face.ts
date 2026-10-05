import { Id } from '../../data/schema/primitives';
import { Type } from '@sinclair/typebox';
import type { CommandRegistry } from '../event/CommandRegistry';
export const argsSchema = Type.Object({ target: Id, dir: Type.Union([Type.Literal('up'), Type.Literal('down'), Type.Literal('left'), Type.Literal('right'), Type.Literal('player')]) }, { additionalProperties: false });
export function registerFace(registry: CommandRegistry): void {
  registry.register('face', {
    args: argsSchema,
    parallelSafe: true,
    run(args, ctx) { ctx.face(args.target, args.dir); },
  });
}

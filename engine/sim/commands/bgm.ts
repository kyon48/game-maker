import { Type } from '@sinclair/typebox';
import { Id, objectOptions } from '../../data/schema/primitives';
import type { CommandRegistry } from '../event/CommandRegistry';
export function registerBgm(registry: CommandRegistry): void {
  registry.register('bgm', { args: Type.Union([Type.Object({ id: Id, fade: Type.Optional(Type.Number({ minimum: 0, maximum: 3600 })) }, objectOptions), Type.Object({ stop: Type.Literal(true), fade: Type.Optional(Type.Number({ minimum: 0, maximum: 3600 })) }, objectOptions)]), parallelSafe: true,
    run: (args, ctx) => { ctx.bgm('id' in args ? args.id : null, args.fade ?? 0); } });
}

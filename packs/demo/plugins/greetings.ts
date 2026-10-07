import { Type } from '@sinclair/typebox';
import type { PluginModule } from '@engine/api';
/** Copy with game.json's greetings variable to keep track of visits to the house. */
const plugin: PluginModule = {
  apiVersion: 1, id: 'greetings',
  register(api) {
    api.commands.register('x_greet', {
      args: Type.Object({ text: Type.String({ minLength: 1 }), speaker: Type.Optional(Type.String()) }, { additionalProperties: false }),
      parallelSafe: false,
      *run(args, ctx) {
        ctx.state.setVar('greetings', ctx.state.getVar('greetings') + 1);
        yield* ctx.showText(args);
      },
    });
    api.conditions.register('x_greeted', {
      args: Type.Object({ minimum: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
      test(args, state) { return state.getVar('greetings') >= args.minimum; },
    });
  },
};
export default plugin;

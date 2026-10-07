import { API_VERSION } from '../apiVersion';
import { GameSchema, CURRENT_FORMAT_VERSION } from '../schema/game';
import { CharactersSchema } from '../schema/characters';
import { SkinSchema } from '../schema/skin';
import { CommonEventsSchema } from '../schema/events';
import type { GameConfig } from '../game';
import type { Characters } from '../characters';
import type { Skin } from '../skin';
import type { Command } from '../events';
import type { ValidationContext } from './context';
export async function coreRules(context: ValidationContext) {
  const { read, source, report, id, options } = context;
  const game = await read('game.json', GameSchema) as GameConfig | undefined;
  const characters = await read('characters.json', CharactersSchema) as Characters | undefined;
  const skin = await read('skin.json', SkinSchema) as Skin | undefined;
  const common = await read('common-events.json', CommonEventsSchema) as Record<string, { commands: Command[] }> | undefined;
  if (!await source.exists('CREDITS.md')) report('V12', 'CREDITS.md', '', 'CREDITS.md is required');
  if (!game || !characters || !skin || !common) return null;
  if (game.id !== id) report('V2', 'game.json', '/id', 'Game id must match pack directory');
  if (game.formatVersion !== CURRENT_FORMAT_VERSION) report('V2', 'game.json', '/formatVersion', 'Unsupported format version');
  for (const plugin of options.plugins ?? []) if (plugin.apiVersion !== API_VERSION) report('V2', `plugins/${plugin.id}.ts`, '/apiVersion', 'Unsupported plugin API version');
  context.diagnostics.push(...options.pluginDiagnostics ?? []);
  for (const [index, name] of game.plugins.entries()) {
    const pointer = `/plugins/${index}`;
    if (!await source.exists(`plugins/${name}.ts`) && !context.diagnostics.some(item => item.code === 'V3' && item.file === 'game.json' && item.pointer === pointer)) report('V3', 'game.json', pointer, `Missing plugin: plugins/${name}.ts`);
  }
  if (skin.window.padding * 2 >= game.screen.width) report('V9', 'skin.json', '/window/padding', 'Message inner width must be positive');
  return { game, characters, skin, common };
}
export type PackBasics = NonNullable<Awaited<ReturnType<typeof coreRules>>>;

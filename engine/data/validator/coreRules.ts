import { battleRules } from './battleRules';
import { BattleSchema } from '../battle';
import type { Battle } from '../battle';
import { AudioSchema, audioFilePattern } from '../audio';
import type { Audio } from '../audio';
import { ItemsSchema, menuLabelKeys, itemNotice } from '../items';
import type { Items } from '../items';
import { PortraitsSchema, portraitSlot, pngSize } from '../portraits';
import type { Portraits } from '../portraits';
import { packPath } from '../loader/path';
import { escapePointer } from './context';
import { VoicesSchema, VoiceManifestSchema } from '../schema/voices';
import type { Voices, VoiceManifest } from '../schema/voices';
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
  for (const name of Object.keys(game.mapNames ?? {})) if (!game.maps.includes(name)) report('V3', 'game.json', `/mapNames/${name}`, 'Unknown map name key');
  if (game.id !== id) report('V2', 'game.json', '/id', 'Game id must match pack directory');
  if (game.formatVersion !== CURRENT_FORMAT_VERSION) report('V2', 'game.json', '/formatVersion', 'Unsupported format version');
  for (const plugin of options.plugins ?? []) if (plugin.apiVersion !== API_VERSION) report('V2', `plugins/${plugin.id}.ts`, '/apiVersion', 'Unsupported plugin API version');
  context.diagnostics.push(...options.pluginDiagnostics ?? []);
  for (const [index, name] of game.plugins.entries()) {
    const pointer = `/plugins/${index}`;
    if (!await source.exists(`plugins/${name}.ts`) && !context.diagnostics.some(item => item.code === 'V3' && item.file === 'game.json' && item.pointer === pointer)) report('V3', 'game.json', pointer, `Missing plugin: plugins/${name}.ts`);
  }
  if (skin.window.padding * 2 >= game.screen.width) report('V9', 'skin.json', '/window/padding', 'Message inner width must be positive');
  const audio = await source.exists('audio.json') ? await read('audio.json', AudioSchema) as Audio | undefined : undefined;
  for (const [id, sound] of Object.entries(audio ?? {})) {
    try { packPath('', sound.file); if (!audioFilePattern.test(sound.file) || !await source.exists(sound.file)) throw new Error('Missing or unsupported audio file'); }
    catch (error) { report('V4', 'audio.json', `/${escapePointer(id)}/file`, String(error)); }
  }
  for (const [map, id] of Object.entries(game.mapBgm ?? {})) {
    if (!game.maps.includes(map)) report('V3', 'game.json', `/mapBgm/${map}`, 'Unknown map');
    if (!Object.hasOwn(audio ?? {}, id)) report('V3', 'game.json', `/mapBgm/${map}`, 'Undeclared audio');
  }
  const battle = await source.exists('battle.json') ? await read('battle.json', BattleSchema) as Battle | undefined : undefined;
  if (battle) await battleRules(context, battle, audio);
  const items = await source.exists('items.json') ? await read('items.json', ItemsSchema) as Items | undefined : undefined;
  if (items) for (const key of menuLabelKeys) if (!game.labels[key]) report('V3', 'game.json', '/labels/' + key, 'Menu label required for items pack');
  if (game.labels.itemGet) try { itemNotice(game.labels.itemGet, 'item', 1); } catch (error) { report('V1', 'game.json', '/labels/itemGet', String(error)); }
  for (const [id, item] of Object.entries(items ?? {})) if (item.icon) {
    try { packPath('', item.icon); if (!await source.exists(item.icon)) throw new Error('Missing icon'); }
    catch (error) { report('V4', 'items.json', `/${escapePointer(id)}/icon`, String(error)); }
  }
  for (const id of Object.keys(game.state.items ?? {})) if (!Object.hasOwn(items ?? {}, id)) report('V3', 'game.json', `/state/items/${id}`, 'Undeclared item');
  const voices = await source.exists('voices.json') ? await read('voices.json', VoicesSchema) as Voices | undefined : undefined;
  const voiceManifest = await source.exists('voice-manifest.json') ? await read('voice-manifest.json', VoiceManifestSchema) as VoiceManifest | undefined : undefined;
  for (const [speaker, voice] of Object.entries(voices ?? {})) if (!['macos-say', 'fake'].includes(voice.provider)) report('V1', 'voices.json', `/${escapePointer(speaker)}/provider`, 'Unknown TTS provider');
  const portraits = await source.exists('portraits.json') ? await read('portraits.json', PortraitsSchema) as Portraits | undefined : undefined;
  const slot = portraitSlot(skin);
  if ((skin.portrait || portraits && Object.keys(portraits).length) && slot.width + slot.gap >= game.screen.width - 2 * skin.window.padding) report('V9', 'skin.json', '/portrait', 'Portrait must leave positive message width');
  for (const [character, expressions] of Object.entries(portraits ?? {})) {
    if (!Object.hasOwn(characters, character)) report('V3', 'portraits.json', `/${escapePointer(character)}`, 'Unknown portrait character');
    for (const [expression, path] of Object.entries(expressions)) {
      const pointer = `/${escapePointer(character)}/${escapePointer(expression)}`;
      try {
        packPath('', path);
        if (!await source.exists(path)) throw new Error('Missing portrait image');
        if (!source.readBytes) throw new Error('PackSource.readBytes required for portrait dimensions');
        pngSize(await source.readBytes(path));
      } catch (error) { report('V4', 'portraits.json', pointer, String(error)); }
    }
  }
  return { battle, audio, items, portraits, voices, voiceManifest, game, characters, skin, common };
}
export type PackBasics = NonNullable<Awaited<ReturnType<typeof coreRules>>>;

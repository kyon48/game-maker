import { schemaErrors } from './schemaErrors';
import type { TSchema } from '@sinclair/typebox';
import type { PackSource } from '@engine/api';
import { GameSchema, CURRENT_FORMAT_VERSION } from '../schema/game';
import { CharactersSchema } from '../schema/characters';
import { SkinSchema } from '../schema/skin';
import { EventsSchema, CommonEventsSchema, CommandSchema, ConditionSchema } from '../schema/events';
import { ID_PATTERN } from '../schema/primitives';
import { ScenarioSchema } from '../schema/scenario';
import { TiledSchema, TilesetSchema } from '../schema/tiled';
import { loadTiled, markers, tileGid } from '../loader/tiled';
import type { TileMapData } from '../loader/tiled';
import { packPath } from '../loader/path';
import type { GameConfig, EventDefinition } from '../game';
import type { Characters } from '../characters';
import type { Skin } from '../skin';
import type { Command, Condition } from '../events';
import type { Diagnostic, ValidationOptions, ValidatedPack } from './types';
const escapePointer = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
export async function validatePack(source: PackSource, id: string, options: ValidationOptions): Promise<{ diagnostics: Diagnostic[]; pack?: ValidatedPack }> {
  const diagnostics: Diagnostic[] = [];
  const report = (code: string, file: string, pointer: string, message: string) => diagnostics.push({ code, file, pointer, message, level: code === 'V10' || code === 'V11' ? 'warning' : 'error' });
  const references = [ConditionSchema, CommandSchema];
  const jsonCache = new Map<string, Promise<unknown>>();
  const readJson = (file: string): Promise<unknown> => {
    let pending = jsonCache.get(file);
    if (!pending) { pending = source.readJson(file); jsonCache.set(file, pending); }
    return pending;
  };
  const check = (schema: TSchema, value: unknown, file: string, pointer = '') => {
    const errors = schemaErrors(schema, references, value);
    for (const error of errors) report('V1', file, pointer + error.path, error.message);
    return errors.length === 0;
  };
  const read = async (file: string, schema: TSchema): Promise<unknown> => {
    try { const value = await readJson(file); return check(schema, value, file) ? value : undefined; }
    catch (error) { report('V1', file, '', `Cannot read JSON: ${String(error)}`); return undefined; }
  };
  const game = await read('game.json', GameSchema) as GameConfig | undefined;
  const characters = await read('characters.json', CharactersSchema) as Characters | undefined;
  const skin = await read('skin.json', SkinSchema) as Skin | undefined;
  const common = await read('common-events.json', CommonEventsSchema) as Record<string, { commands: Command[] }> | undefined;
  if (!await source.exists('CREDITS.md')) report('V12', 'CREDITS.md', '', 'CREDITS.md is required');
  if (!game || !characters || !skin || !common) return { diagnostics };
  if (game.id !== id) report('V2', 'game.json', '/id', 'Game id must match pack directory');
  if (game.formatVersion !== CURRENT_FORMAT_VERSION) report('V2', 'game.json', '/formatVersion', 'Unsupported format version');
  for (const plugin of options.plugins ?? []) if (plugin.apiVersion !== 1) report('V2', `plugins/${plugin.id}.ts`, '/apiVersion', 'Unsupported plugin API version');
  if (skin.window.padding * 2 >= game.screen.width) report('V9', 'skin.json', '/window/padding', 'Message inner width must be positive');
  const usedCharacters = new Set<string>(), usedCommon = new Set<string>(), usedFlags = new Set<string>(), usedVars = new Set<string>();
  const characterReference = (name: string, file: string, pointer: string) => {
    usedCharacters.add(name); if (!Object.hasOwn(characters, name)) report('V3', file, pointer, `Unknown character: ${name}`);
  };
  characterReference(game.player, 'game.json', '/player');
  const events = new Map<string, EventDefinition[]>(), maps = new Map<string, TileMapData>();
  const asset = async (path: string, file: string, pointer: string, owner = 'game.json') => {
    try {
      const resolved = packPath(owner, path);
      if (!await source.exists(resolved)) report('V4', file, pointer, `Missing asset: ${resolved}`);
    } catch (error) { report('V4', file, pointer, String(error)); }
  };
  for (const [name, graphic] of Object.entries(characters)) if (graphic.sheet) await asset(graphic.sheet, 'characters.json', `/${escapePointer(name)}/sheet`);
  await asset(skin.font.src, 'skin.json', '/font/src');
  if (skin.window.image) await asset(skin.window.image, 'skin.json', '/window/image');
  for (let index = 0; index < game.maps.length; index++) {
    const mapId = game.maps[index]!, path = `maps/${mapId}.tmj`, eventFile = `maps/${mapId}.events.json`;
    for (const file of [path, eventFile]) if (!await source.exists(file)) report('V3', 'game.json', `/maps/${index}`, `Missing map file: ${file}`);
    const raw = await read(path, TiledSchema) as { tilesets: ({ firstgid: number; source?: string; image?: string })[] } | undefined;
    const eventData = await read(eventFile, EventsSchema) as { events: EventDefinition[] } | undefined;
    if (eventData) events.set(mapId, eventData.events);
    if (!raw) continue;
    // Resolve tileset paths independently, so missing images and .tsj report V4.
    for (let i = 0; i < raw.tilesets.length; i++) {
      const set = raw.tilesets[i]!, pointer = `/tilesets/${i}`;
      if (set.source !== undefined) {
        try {
          const owner = packPath(path, set.source);
          if (!await source.exists(owner)) { report('V4', path, pointer + '/source', `Missing tileset: ${owner}`); continue; }
          const external = await read(owner, TilesetSchema) as { image: string } | undefined;
          if (external) await asset(external.image, owner, '/image', owner);
        } catch (error) { report('V4', path, pointer + '/source', String(error)); }
      } else if (set.image !== undefined) await asset(set.image, path, pointer + '/image', path);
    }
    try {
      const map = await loadTiled({ readJson, exists: path => source.exists(path) }, path, game.tileSize); maps.set(mapId, map);
      for (const [li, layer] of map.layers.entries()) if (layer.type === 'objectgroup' && layer.name === 'markers') {
        for (const [oi, point] of layer.objects.entries()) if (!new RegExp(ID_PATTERN).test(point.name)) report('V5', path, `/layers/${li}/objects/${oi}/name`, 'Invalid marker id');
      }
      const bounds = (x: number, y: number) => x >= 0 && y >= 0 && x < map.width && y < map.height;
      const ids = new Set<string>();
      for (let i = 0; i < (eventData?.events.length ?? 0); i++) {
        const event = eventData!.events[i]!;
        if (ids.has(event.id)) report('V5', eventFile, `/events/${i}/id`, 'Duplicate event id'); ids.add(event.id);
        if (!bounds(event.x, event.y)) report('V5', eventFile, `/events/${i}`, 'Event outside map');
      }
      for (let li = 0; li < map.layers.length; li++) {
        const layer = map.layers[li]!;
        if (layer.type === 'tilelayer') for (let i = 0; i < layer.data.length; i++) {
          const gid = tileGid(layer.data[i]!); if (gid !== 0 && !map.tileLookup.has(gid)) report('V5', path, `/layers/${li}/data/${i}`, 'GID outside tileset range');
        }
      }
    } catch (error) { report('V5', path, '', String(error)); }
  }
  function arrival(mapId: string, x: number, y: number, file: string, pointer: string) {
    const map = maps.get(mapId); if (!map) return;
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) { report('V6', file, pointer, 'Arrival outside map'); return; }
    for (const layer of map.layers) if (layer.type === 'tilelayer' && layer.name === 'collision' && tileGid(layer.data[y * map.width + x] ?? 0) !== 0) report('V6', file, pointer, 'Arrival on collision');
  }
  if (!game.maps.includes(game.start.map)) report('V3', 'game.json', '/start/map', 'Unknown start map');
  else arrival(game.start.map, game.start.x, game.start.y, 'game.json', '/start');
  function condition(value: Condition, file: string, pointer: string, scoped: boolean) {
    if (!check(ConditionSchema, value, file, pointer)) return;
    if ('flag' in value) { usedFlags.add(value.flag); if (!Object.hasOwn(game!.state.flags, value.flag)) report('V3', file, pointer + '/flag', 'Undeclared flag'); }
    else if ('var' in value) { usedVars.add(value.var); if (!Object.hasOwn(game!.state.vars, value.var)) report('V3', file, pointer + '/var', 'Undeclared variable'); }
    else if ('self' in value && !scoped) report('V3', file, pointer + '/self', 'Self requires an event context');
    else if ('all' in value || 'any' in value) {
      const key = 'all' in value ? 'all' : 'any', children = 'all' in value ? value.all : value.any;
      children.forEach((child, i) => condition(child, file, `${pointer}/${key}/${i}`, scoped));
    } else if ('not' in value) condition(value.not, file, pointer + '/not', scoped);
    else if ('plugin' in value) {
      const schema = options.conditions?.get(value.plugin);
      if (!schema) report('V1', file, pointer + '/plugin', 'Unknown plugin condition'); else check(schema, value.args, file, pointer + '/args');
    }
  }
  const calls = new Map<string, Set<string>>();
  function list(commands: readonly Command[], file: string, pointer: string, mapId?: string, parallel = false, owner?: string, stack: readonly string[] = [], cursor?: { maps: Set<string> }): boolean {
    let changes = false, currentMaps = new Set(cursor?.maps ?? (mapId ? [mapId] : []));
    commands.forEach((command, i) => {
      const p = `${pointer}/${i}`, definition = options.commands.get(command.cmd);
      if (!definition) { report('V1', file, p + '/cmd', `Unknown command: ${command.cmd}`); return; }
      const args = Object.fromEntries(Object.entries(command).filter(([key]) => key !== 'cmd'));
      if (['wait', 'fade'].includes(command.cmd) && command.frames !== undefined && schemaErrors(definition.args.properties.frames as TSchema, references, command.frames).length > 0) report('V9', file, p + '/frames', 'Frames must be positive safe integer');
      if (command.cmd === 'move' && Array.isArray(command.route)) command.route.forEach((token, index) => {
        if (schemaErrors(definition.args.properties.route.items as TSchema, references, token).length > 0) report('V9', file, `${p}/route/${index}`, 'Invalid route token');
      });
      if (!check(definition.args, args, file, p)) return;
      if (parallel && !definition.parallelSafe) report('V7', file, p + '/cmd', `Forbidden parallel command: ${command.cmd}`);
      if (['set_flag', 'set_var', 'set_self_flag', 'transfer', 'stop'].includes(command.cmd)) changes = true;
      if (command.cmd === 'set_flag') { const name = command.flag as string; usedFlags.add(name); if (!Object.hasOwn(game!.state.flags, name)) report('V3', file, p + '/flag', 'Undeclared flag'); }
      if (command.cmd === 'set_var') { const name = command.var as string; usedVars.add(name); if (!Object.hasOwn(game!.state.vars, name)) report('V3', file, p + '/var', 'Undeclared variable'); }
      if (command.cmd === 'if') {
        condition(command.cond as Condition, file, p + '/cond', true);
        const thenMaps = { maps: new Set(currentMaps) }, elseMaps = { maps: new Set(currentMaps) };
        changes = list(command.then as Command[], file, p + '/then', mapId, parallel, owner, stack, thenMaps) || changes;
        changes = list((command.else ?? []) as Command[], file, p + '/else', mapId, parallel, owner, stack, elseMaps) || changes;
        currentMaps = new Set([...thenMaps.maps, ...elseMaps.maps]);
      }
      if (command.cmd === 'choice') {
        const choices = command.options as { when?: Condition; commands: Command[] }[];
        if (command.cancel !== undefined && command.cancel !== null && (command.cancel as number) >= choices.length) report('V9', file, p + '/cancel', 'Cancel index outside options');
        const choiceMaps = new Set<string>();
        choices.forEach((choice, index) => {
          const branch = { maps: new Set(currentMaps) };
          if (choice.when) condition(choice.when, file, `${p}/options/${index}/when`, true);
          changes = list(choice.commands, file, `${p}/options/${index}/commands`, mapId, parallel, owner, stack, branch) || changes;
          for (const name of branch.maps) choiceMaps.add(name);
        });
        currentMaps = choiceMaps;
      }
      if (command.cmd === 'transfer') {
        const name = command.map as string;
        if (!game!.maps.includes(name)) report('V3', file, p + '/map', 'Unknown transfer map');
        const marker = command.marker as string | undefined;
        if (marker !== undefined ? command.x !== undefined || command.y !== undefined : command.x === undefined || command.y === undefined) report('V9', file, p, 'Transfer requires exactly marker or x+y');
        else if (marker !== undefined) {
          const point = maps.has(name) ? markers(maps.get(name)!).get(marker) : undefined;
          if (!point) report('V3', file, p + '/marker', 'Unknown marker'); else arrival(name, point.x, point.y, file, p + '/marker');
        } else arrival(name, command.x as number, command.y as number, file, p);
        currentMaps = new Set([name]);
      }
      if (['face', 'move', 'show_character'].includes(command.cmd)) {
        const target = command.target as string;
        if (command.cmd === 'show_character' && target === 'player') report('V3', file, p + '/target', 'show_character target must be an event');
        else if (target !== 'this' && target !== 'player') for (const name of currentMaps) if (!events.get(name)?.some(event => event.id === target)) report('V3', file, p + '/target', `Unknown event target in ${name}`);
      }
      if (command.cmd === 'move') for (const [index, token] of (command.route as string[]).entries()) if (token.startsWith('wait:') && !Number.isSafeInteger(Number(token.slice(5)))) report('V9', file, `${p}/route/${index}`, 'Unsafe route wait');
      if (command.cmd === 'call') {
        const name = command.common as string; usedCommon.add(name);
        if (owner) { const outgoing = calls.get(owner) ?? new Set<string>(); outgoing.add(name); calls.set(owner, outgoing); }
        if (!Object.hasOwn(common!, name)) report('V3', file, p + '/common', 'Unknown common event');
        else if (!stack.includes(name)) {
          const called = { maps: new Set(currentMaps) };
          changes = list(common![name]!.commands, 'common-events.json', `/${escapePointer(name)}/commands`, mapId, parallel, name, [...stack, name], called) || changes;
          currentMaps = called.maps;
        }
      }
    });
    if (cursor) cursor.maps = currentMaps;
    return changes;
  }
  for (const [name, event] of Object.entries(common)) list(event.commands, 'common-events.json', `/${escapePointer(name)}/commands`, undefined, false, name, [name]);
  for (const [mapId, definitions] of events) definitions.forEach((event, ei) => event.pages.forEach((page, pi) => {
    const file = `maps/${mapId}.events.json`, p = `/events/${ei}/pages/${pi}`;
    if (page.character) characterReference(page.character, file, p + '/character');
    if (page.when) condition(page.when, file, p + '/when', true);
    const changes = list(page.commands ?? [], file, p + '/commands', mapId, page.trigger === 'parallel');
    if (page.trigger === 'auto' && !changes) report('V10', file, p, 'Auto page may repeat indefinitely');
  }));
  function cycle(name: string, stack: string[], visited: Set<string>) {
    if (stack.includes(name)) { report('V8', 'common-events.json', `/${escapePointer(name)}/commands`, `Call cycle: ${[...stack, name].join(' -> ')}`); return; }
    if (visited.has(name)) return;
    visited.add(name); for (const next of calls.get(name) ?? []) cycle(next, [...stack, name], visited);
  }
  for (const name of Object.keys(common)) cycle(name, [], new Set());
  for (const [kind, declared, used] of [['characters', characters, usedCharacters], ['common-events', common, usedCommon], ['flags', game.state.flags, usedFlags], ['vars', game.state.vars, usedVars]] as const) {
    for (const key of Object.keys(declared)) if (!used.has(key)) report('V11', kind === 'flags' || kind === 'vars' ? 'game.json' : `${kind}.json`, kind === 'flags' || kind === 'vars' ? `/state/${kind}/${escapePointer(key)}` : `/${escapePointer(key)}`, `Unused ${kind}: ${key}`);
  }
  if (source.listFiles) for (const file of await source.listFiles()) {
    if (/^tests\/.*\.scenario\.json$/.test(file)) await read(file, ScenarioSchema);
    if (/^maps\/[^/]+\.tmj$/.test(file) && !game.maps.includes(file.slice(5, -4))) report('V11', file, '', 'Map not listed in game.maps');
  }
  return { diagnostics, pack: diagnostics.some(result => result.level === 'error') ? undefined : { game, characters, skin, common, events, maps } };
}

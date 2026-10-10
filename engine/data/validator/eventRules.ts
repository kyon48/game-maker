import { textRules } from './textRules';
import type { TSchema } from '@sinclair/typebox';
import { RouteTokenSchema } from '../schema/routes';
import { ConditionSchema } from '../schema/events';
import type { Condition, Command } from '../events';
import { markers } from '../loader/tiled';
import { schemaErrors } from './schemaErrors';
import { escapePointer } from './context';
import type { ValidationContext, Usage } from './context';
import type { PackBasics } from './coreRules';
import type { MapChecks } from './mapRules';
export function eventRules(context: ValidationContext, basics: PackBasics, checks: MapChecks, usage: Usage): void {
  const { check, options, report, references } = context;
  const { game, common } = basics;
  const { maps, events, arrival } = checks;
  const { usedFlags, usedVars, usedCommon, characterReference } = usage;
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
      if (command.cmd === 'text') {
        const speaker = (command.speaker as string | undefined) ?? 'narrator';
        if (basics.voices && !/[{}]/.test(speaker) && !Object.hasOwn(basics.voices, speaker)) report('VOICE', file, p + '/speaker', `Missing voice: ${speaker}`);
        textRules(context, basics, usage, command.text as string, true, file, p + '/text');
        if (command.speaker !== undefined) textRules(context, basics, usage, command.speaker as string, false, file, p + '/speaker');
      }
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
        const choices = command.options as { label: string; when?: Condition; commands: Command[] }[];
        if (command.prompt !== undefined) textRules(context, basics, usage, command.prompt as string, false, file, p + '/prompt');
        if (command.cancel !== undefined && command.cancel !== null && (command.cancel as number) >= choices.length) report('V9', file, p + '/cancel', 'Cancel index outside options');
        const choiceMaps = new Set<string>();
        choices.forEach((choice, index) => {
          textRules(context, basics, usage, choice.label, false, file, `${p}/options/${index}/label`);
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
    for (const [index, token] of (page.wander ?? []).entries()) if (schemaErrors(RouteTokenSchema, [], token).length || (token.startsWith('wait:') && !Number.isSafeInteger(Number(token.slice(5))))) report('V9', file, `${p}/wander/${index}`, 'Invalid wander route token');
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
}

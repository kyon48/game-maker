import { textRules } from './textRules';
import type { Usage } from './context';
import { packPath } from '../loader/path';
import { FilmSchema } from '../schema/film';
import type { Film, FilmExpect } from '../schema/film';
import type { PackBasics } from './coreRules';
import type { Condition, Command } from '../events';
import type { ValidationContext } from './context';
import { escapePointer } from './context';
import type { MapChecks } from './mapRules';
function walkCommands(commands: readonly Command[], common: PackBasics['common'], seen = new Set<string>()): Set<string> {
  const targets = new Set<string>();
  for (const command of commands) {
    if (command.cmd === 'transfer') targets.add(command.map as string);
    const lists: Command[][] = [];
    if (command.cmd === 'if') lists.push(command.then as Command[], (command.else ?? []) as Command[]);
    if (command.cmd === 'choice') for (const option of command.options as { commands: Command[] }[]) lists.push(option.commands);
    if (command.cmd === 'call' && !seen.has(command.common as string)) { seen.add(command.common as string); lists.push(common[command.common as string]?.commands ?? []); }
    for (const list of lists) for (const map of walkCommands(list, common, seen)) targets.add(map);
  }
  return targets;
}
/** Static references across possible map transitions. Actual branch reachability is checked by rehearsal. */
export async function filmRules(context: ValidationContext, basics: PackBasics, checks: MapChecks, usage: Usage): Promise<void> {
  if (!context.source.listFiles) return;
  const { game, common } = basics;
  const { read, report, check, options } = context;
  const cueIds = new Set<string>();
  const collectCues = (commands: readonly Command[]) => {
    for (const command of commands) {
      if (command.cmd === 'film_cue') cueIds.add(command.id as string);
      if (command.cmd === 'if') { collectCues(command.then as Command[]); collectCues((command.else ?? []) as Command[]); }
      if (command.cmd === 'choice') for (const option of command.options as { commands: Command[] }[]) collectCues(option.commands);
    }
  };
  for (const events of checks.events.values()) for (const event of events) for (const page of event.pages) collectCues(page.commands ?? []);
  for (const event of Object.values(common)) collectCues(event.commands);
  const point = (map: string, x: number, y: number, file: string, pointer: string) => {
    if (!game.maps.includes(map)) { report('V3', file, pointer + '/map', 'Unknown film map'); return; }
    checks.arrival(map, x, y, file, pointer);
  };
  function condition(e: Condition | FilmExpect, file: string, pointer: string): void {
    if ('flag' in e && !Object.hasOwn(game.state.flags, e.flag)) report('V3', file, pointer + '/flag', 'Undeclared film flag');
    if ('var' in e && !Object.hasOwn(game.state.vars, e.var)) report('V3', file, pointer + '/var', 'Undeclared film variable');
    if ('all' in e || 'any' in e) { const key = 'all' in e ? 'all' : 'any'; const children = 'all' in e ? e.all : e.any; children.forEach((child, i) => condition(child, file, `${pointer}/${key}/${i}`)); }
    if ('not' in e) condition(e.not, file, pointer + '/not');
    if ('plugin' in e) { const schema = options.conditions?.get(e.plugin); if (!schema) report('V1', file, pointer + '/plugin', 'Unknown film plugin condition'); else check(schema, e.args, file, pointer + '/args'); }
    if ('self' in e) {
      if (!('map' in e) || !('event' in e)) report('V3', file, pointer, 'Film self expectation requires map/event');
      else if (!checks.events.get(e.map)?.some(event => event.id === e.event)) report('V3', file, pointer + '/event', 'Unknown film self event/map');
    }
    if ('map' in e && !('self' in e)) {
      if (!game.maps.includes(e.map)) report('V3', file, pointer + '/map', 'Unknown film expected map');
      else if (e.x !== undefined && e.y !== undefined) point(e.map, e.x, e.y, file, pointer);
    }
  }
  for (const file of (await context.source.listFiles()).filter(file => /^films\/[^/]+\.film\.json$/.test(file))) {
    if (!/^films\/[a-z][a-z0-9_]*\.film\.json$/.test(file)) report('V9', file, '', 'Film filename must use an ID');
    const film = await read(file, FilmSchema) as Film | undefined;
    if (!film) continue;
    const start = film.start ?? game.start;
    point(start.map, start.x, start.y, file, film.start ? '/start' : '');
    for (const kind of ['flags', 'vars'] as const) for (const key of Object.keys(film.state?.[kind] ?? {})) {
      if (!Object.hasOwn(game.state[kind], key)) report('V3', file, `/state/${kind}/${escapePointer(key)}`, 'Undeclared film state key');
    }
    let possible = new Set([start.map]); const chapters = new Set<string>();
    for (const [i, step] of film.steps.entries()) {
      const p = `/steps/${i}`;
      if ('cue' in step && step.cue && !cueIds.has(step.cue)) report('V3', file, p + '/cue', 'Unknown film cue');
      if ('narrate' in step) {
        textRules(context, basics, usage, step.narrate, true, file, p + '/narrate');
        if (basics.voices && !basics.voices.narrator) report('VOICE', file, p + '/narrate', 'Missing narrator voice');
      }
      if ('music' in step && step.music) {
        try {
          const music = packPath('', step.music.file);
          if (music !== step.music.file || !/\.(ogg|wav|mp3|flac|m4a)$/i.test(music)) report('V3', file, p + '/music/file', 'Music must use a pack-relative audio file (ogg/wav/mp3/flac/m4a)');
          else if (!await context.source.exists(music)) report('V3', file, p + '/music/file', 'Missing film music file');
        } catch { report('V3', file, p + '/music/file', 'Music path must stay inside the pack'); }
      }
      if ('chapter' in step) { if (chapters.has(step.chapter)) report('V9', file, p + '/chapter', 'Duplicate film chapter'); chapters.add(step.chapter); }
      if ('expectSave' in step) condition(step.expectSave, file, p + '/expectSave');
      if ('reload' in step) possible = new Set(game.maps);
      if ('expect' in step) { condition(step.expect, file, p + '/expect'); if ('map' in step.expect && !('self' in step.expect)) { possible = new Set([step.expect.map]); continue; } }
      if ('walkTo' in step) {
        const target = step.walkTo;
        if ('event' in target) {
          if (![...possible].some(map => checks.events.get(map)?.some(event => event.id === target.event))) report('V3', file, p + '/walkTo/event', 'Unknown event in possible current film maps');
        } else if (![...possible].some(map => { const data = checks.maps.get(map); return data && target.x < data.width && target.y < data.height; })) report('V6', file, p + '/walkTo', 'Film destination out of bounds');
      }
      // Between steps a touch/auto/action can transfer. Include reachable map closures, not unrelated maps.
      let changed = true;
      while (changed) {
        changed = false;
        for (const map of [...possible]) for (const event of checks.events.get(map) ?? []) for (const page of event.pages) for (const transfer of walkCommands(page.commands ?? [], common)) {
          if (!possible.has(transfer)) { possible.add(transfer); changed = true; }
        }
      }
    }
  }
}

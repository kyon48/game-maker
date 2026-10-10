import { FilmCueGate } from '../../engine/film/cues';
import { storyCues } from './cues';
import type { Film, FilmStep } from '../../engine/data/schema/film';
import type { Scenario } from '../../engine/data/scenarios/run';
import type { InputFrame } from '../../engine/api';
import type { ValidatedPack } from '../../engine/data/validator/types';
import type { PluginRuntime } from '../../engine/sim/plugins/PluginRuntime';
import { GameSession } from '../../engine/sim/state/GameSession';
import { FilmDriver } from '../../engine/film/driver';
import { observeGame, checkExpect } from '../../engine/film/view';
import type { Story, Statement, Condition, Event, Scene, Dir } from './ast';
import { anchorPoints, compileError, jsonBytes } from './compile';

type ScenarioStep = Scenario['steps'][number];
const empty = (): InputFrame => ({ held: new Set(), pressed: new Set() });
/** Plan with manual text and immediate cues; voice lengths never participate in generation. */
export async function generateFilm(stories: readonly Story[], pack: ValidatedPack, plugins: PluginRuntime, name = 'main'): Promise<Map<string, string>> {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error('film 이름은 소문자 ID여야 합니다');
  const gate = new FilmCueGate(), cues = storyCues(stories);
  const runtime = new GameSession(pack, { plugins, recording: true, filmCues: gate });
  const steps: FilmStep[] = [], scenario: ScenarioStep[] = [], narration: string[] = [`# ${name}`, ''];
  const locations = stories.flatMap(s => s.locations), common = new Map(stories.flatMap(s => s.common.map(c => [c.id, c.statements] as const)));
  let source: Scene | Event = stories.flatMap(s => s.scenes)[0]!;
  let total = 0;
  const appendInput = (list: ScenarioStep[], input: InputFrame) => {
    const action = [...input.held][0], last = list.at(-1);
    if (!action) {
      if (last && 'wait' in last) last.wait++;
      else list.push({ wait: 1 });
    } else if (!input.pressed.size && last && 'hold' in last && last.hold === action) last.frames++;
    else if (input.pressed.has(action)) list.push({ hold: action, frames: 1 });
    else compileError(source, 'S032', '시나리오로 표현할 수 없는 입력 이력');
  };
  const tick = async (input: InputFrame) => {
    if (++total > 216000) compileError(source, 'S032', '촬영 경로가 216000틱을 초과했습니다');
    appendInput(scenario, input);
    runtime.game.tick(input); await Promise.resolve();
  };
  const emit = async (step: FilmStep) => {
    const previous = steps.at(-1);
    if ('walkTo' in step && previous && 'walkTo' in previous && JSON.stringify(previous.walkTo) === JSON.stringify(step.walkTo)) return;
    steps.push(step);
    const planning = 'advanceText' in step && step.advanceText === 'voice' ? { ...step, advanceText: 'auto' as const } : step;
    const driver = new FilmDriver({ name, steps: [planning] });
    for (;;) {
      const input = driver.next(observeGame(runtime.game), e => checkExpect(runtime.game, e));
      if (!input) break;
      await tick(input);
    }
    if ('expect' in step) scenario.push({ expect: step.expect });
  };
  const waitReady = async (initial = false, boundary?: string, auto = false) => {
    let count = 0;
    if (initial) { await tick(empty()); count++; }
    while ((!boundary || runtime.game.map.id === boundary) && !gate.pending && !runtime.game.message.opened && !runtime.game.choice.opened && (runtime.game.main.running || runtime.game.player.moving || (auto && pendingAuto()))) {
      if (++count > 36000) compileError(source, 'S032', '메시지/이벤트 완료 대기 시간 초과');
      await tick(empty());
    }
    if (count && (runtime.game.message.opened || runtime.game.choice.opened)) steps.push({ waitFor: 'message' });
    else if (count && !gate.pending) steps.push({ wait: count });
  };
  const drain = async (choices: number[], selectedPath: readonly Statement[], initial = false) => {
    const map = runtime.game.map.id;
    await waitReady(initial, map, initial);
    let selected = 0, cueIndex = 0;
    const queued = selectedPath.filter(node => node.kind === 'narration' || node.kind === 'waitNarration');
    while (runtime.game.map.id === map && (runtime.game.main.running || runtime.game.message.opened || runtime.game.choice.opened)) {
      if (gate.pending) {
        const node = queued[cueIndex++];
        if (!node || cues.get(node) !== gate.pending) compileError(source, 'S031', `원고 경로와 다른 cue: ${gate.pending}`);
        if (pack.voices) steps.push(node.kind === 'narration' ? { narrate: node.text, cue: gate.pending } : { waitNarration: true, cue: gate.pending });
        gate.release(gate.pending);
      } else if (runtime.game.choice.opened) {
        const index = choices[selected++];
        if (index === undefined) compileError(source, 'S031', '원고 경로에 없는 선택지가 열렸습니다 (@cmd 내부 선택지는 지원하지 않음)');
        await emit({ choose: index, dwell: 0.4 });
      } else if (runtime.game.message.opened) {
        const speaker = runtime.game.message.snapshot?.speaker ?? 'narrator';
        await emit({ advanceText: pack.voices?.[speaker] ? 'voice' : 'auto', count: 1 });
      }
      await waitReady(false, map, initial);
    }
    if (selected !== choices.length) compileError(source, 'S031', '예상 선택지가 실행되지 않았습니다');
  };
  const pendingAuto = () => runtime.game.events.some(e => e.active && e.page?.trigger === 'auto');
  const condition = (value: Condition, flags: Record<string, boolean>, vars: Record<string, number>): boolean => {
    if (value.kind === 'flag') return flags[value.name] === value.enabled;
    if (value.kind === 'variable') { const a = vars[value.name]!, b = value.value; return ({ '==': a === b, '!=': a !== b, '<': a < b, '<=': a <= b, '>': a > b, '>=': a >= b })[value.op]; }
    return value.kind === 'all' ? value.conditions.every(c => condition(c, flags, vars)) : value.conditions.some(c => condition(c, flags, vars));
  };
  const pathStatements = (list: readonly Statement[], flags: Record<string, boolean>, vars: Record<string, number>, choices: number[], expected: Map<string, boolean>, depth = 0): Statement[] => {
    if (depth > 64) compileError(source, 'S031', '공통 이벤트 호출 깊이 초과');
    const result: Statement[] = [];
    for (const node of list) {
      result.push(node);
      if (node.kind === 'if') result.push(...pathStatements(condition(node.condition, flags, vars) ? node.then : node.else, flags, vars, choices, expected, depth + 1));
      if (node.kind === 'choice') { const index = Math.max(0, node.options.findIndex(o => o.chosen)); choices.push(index); result.push(...pathStatements(node.options[index]!.statements, flags, vars, choices, expected, depth + 1)); }
      if (node.kind === 'set' || node.kind === 'unset') { flags[node.flag] = node.kind === 'set'; expected.set(node.flag, node.kind === 'set'); }
      if (node.kind === 'add' || node.kind === 'sub') vars[node.variable] = vars[node.variable]! + (node.kind === 'add' ? node.amount : -node.amount);
      if (node.kind === 'call') result.push(...pathStatements(common.get(node.common)!, flags, vars, choices, expected, depth + 1));
    }
    return result;
  };
  const stepInto = async (id: string) => {
    const target = runtime.game.events.find(e => e.id === id)!;
    const dx = target.x - runtime.game.player.x, dy = target.y - runtime.game.player.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) compileError(source, 'S030', `touch 대상에 인접하지 않음: ${id}`);
    const dir: Dir = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up';
    await emit({ walk: [dir] });
  };
  const travel = async (destination: string) => {
    const queue: { map: string; doors: { map: string; id: string }[] }[] = [{ map: runtime.game.map.id, doors: [] }], seen = new Set<string>();
    let route: { map: string; id: string }[] | undefined;
    while (queue.length) {
      const item = queue.shift()!;
      if (item.map === destination) { route = item.doors; break; }
      if (seen.has(item.map)) continue; seen.add(item.map);
      for (const anchor of locations.find(l => l.id === item.map)!.anchors) if (anchor.destination) queue.push({ map: anchor.destination.location, doors: [...item.doors, { map: item.map, id: anchor.name }] });
    }
    if (!route) compileError(source, 'S030', `문 경로 없음: ${runtime.game.map.id} → ${destination}`);
    for (const door of route) {
      await emit({ walkTo: { event: door.id } }); await stepInto(door.id);
      await waitReady();
      // A destination auto event belongs to its scene, never to a door's choice queue.
      if (!pendingAuto() && !runtime.game.message.opened && !runtime.game.choice.opened) await emit({ settle: true });
    }
  };
  const hints = async (nodes: readonly Statement[], map: string) => {
    for (const node of nodes) {
      if (node.kind === 'filmPause') await emit({ pause: node.seconds });
      if (node.kind === 'filmWalkTo') {
        const p = anchorPoints(locations.find(l => l.id === map)!).get(node.anchor)!;
        const event = stories.flatMap(s => s.scenes).filter(s => s.location === map).flatMap(s => s.items).find((e): e is Event => e.kind === 'event' && anchorPoints(locations.find(l => l.id === map)!).get(e.anchor)?.name === p.name);
        if (event?.film === 'skip') continue;
        await emit(event ? { walkTo: { event: event.id } } : { walkTo: { x: p.x, y: p.y } });
      }
    }
  };
  let chapter: string | undefined;
  const finalFlags = new Map<string, boolean>();
  for (const scene of stories.flatMap(s => s.scenes)) {
    source = scene;
    if (scene.chapter && scene.chapter !== chapter) { chapter = scene.chapter; await emit({ chapter }); narration.push(`## ${chapter}`, ''); }
    narration.push(`### ${scene.title}`, '');
    await travel(scene.location);
    const expected = new Map<string, boolean>();
    for (const item of scene.items) {
      if (item.kind === 'narration') { narration.push(item.text, ''); if (pack.voices) steps.push({ narrate: item.text }); }
      else if (item.kind === 'waitNarration') { if (pack.voices) steps.push({ waitNarration: true }); }
      else if (item.kind === 'filmPause' || item.kind === 'filmWalkTo') await hints([item], scene.location);
      else if (item.kind === 'event') {
        if (item.film === 'skip') continue;
        source = item;
        const state = runtime.game.state.snapshot();
        const completed = runtime.game.state.getSelf(scene.location, item.id, 'story_once');
        const page = [...item.pages].reverse().find(candidate => {
          const index = item.pages.indexOf(candidate);
          const onceAllows = !item.once || (index === 0 ? !completed : completed);
          return onceAllows && (!candidate.condition || condition(candidate.condition, state.flags, state.vars));
        });
        if (!page) continue;
        const choices: number[] = [];
        const selected = pathStatements(page.statements, state.flags, state.vars, choices, expected);
        for (const node of selected) if (node.kind === 'narration') narration.push(node.text, '');
        if (item.trigger !== 'auto') {
          await hints(selected, scene.location);
          await emit({ walkTo: { event: item.id } }); await emit({ pause: 0.35 });
          if (item.trigger === 'action') await emit({ press: 'ok' }); else await stepInto(item.id);
        }
        await drain(choices, selected, item.trigger === 'auto');
        if (item.trigger === 'auto') await hints(selected, runtime.game.map.id);
        if (!pendingAuto() && !runtime.game.message.opened && !runtime.game.choice.opened) await emit({ settle: true });
      }
    }
    for (const [flag, is] of expected) { await emit({ expect: { flag, is } }); finalFlags.set(flag, is); }
  }
  for (const [flag, is] of finalFlags) await emit({ expect: { flag, is } });
  // Input transcript replays the exact chosen path, including waits and movement, without a second pathfinder.
  return new Map([
    [`films/${name}.film.json`, jsonBytes({ name, steps } satisfies Film)],
    [`films/${name}.narration.md`, narration.join('\n')],
    [`tests/story_${name}.scenario.json`, jsonBytes({ name: `story_${name}`, steps: scenario } satisfies Scenario)],
  ]);
}

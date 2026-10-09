import type { Story, Location, Anchor, Source, Condition, Statement, Event, Diagnostic } from './ast';
export interface Tiles { wall: number; floor: number; door: number; tileset: string; firstgid?: number }
export interface Compilation { files: Map<string, string>; maps: Map<string, string>; diagnostics: Diagnostic[] }
export class StoryCompileError extends Error {
  constructor(readonly diagnostic: Diagnostic) { super(diagnostic.message); }
}
export function compileError(source: Source, code: string, message: string): never { throw new StoryCompileError({ file: source.file, line: source.line, code, level: 'error', message }); }
export const jsonBytes = (value: unknown): string => JSON.stringify(value, null, 2) + '\n';
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON 객체가 필요합니다');
  return value as Record<string, unknown>;
}
export function parseTiles(value: unknown): Tiles {
  const data = object(value);
  for (const name of ['wall', 'floor', 'door', 'firstgid']) {
    if (name === 'firstgid' && data[name] === undefined) continue;
    if (!Number.isSafeInteger(data[name]) || (data[name] as number) < 1 || (data[name] as number) > 0x0fffffff) throw new Error(`타일 ${name}은 양의 GID여야 합니다`);
  }
  if (typeof data.tileset !== 'string' || !data.tileset.endsWith('.tsj') || data.tileset.startsWith('/') || data.tileset.includes('\\') || data.tileset.split('/').some(part => !part || part === '..' || part === '.') || /^[a-z]:/i.test(data.tileset)) throw new Error('tileset은 팩 내부 .tsj 상대 경로여야 합니다');
  return { wall: data.wall as number, floor: data.floor as number, door: data.door as number, tileset: data.tileset, firstgid: data.firstgid as number | undefined };
}
interface Point { x: number; y: number; name: string; anchor: Anchor }
export function anchorPoints(location: Location): ReadonlyMap<string, Point> {
  const points = new Map<string, Point>();
  for (const anchor of location.anchors) {
    for (const [y, row] of (location.layout?.rows ?? []).entries()) {
      const x = [...row.text].indexOf(anchor.character);
      if (x >= 0) { const point = { x, y, name: anchor.name, anchor }; points.set(anchor.name, point); points.set(anchor.character, point); break; }
    }
  }
  return points;
}
function engineCondition(value: Condition): unknown {
  if (value.kind === 'flag') return { flag: value.name, is: value.enabled };
  if (value.kind === 'variable') return { var: value.name, op: value.op, value: value.value };
  return { [value.kind]: value.conditions.map(engineCondition) };
}
export function compileStories(stories: readonly Story[], gameValue: unknown, tileValue: unknown, existingMaps: ReadonlyMap<string, string> = new Map(), forceMaps = false): Compilation {
  const game = object(gameValue), tileSize = game.tileSize;
  if (!Number.isSafeInteger(tileSize) || (tileSize as number) < 1) throw new Error('game.json에 양의 tileSize가 필요합니다');
  const size = tileSize as number, tiles = parseTiles(tileValue), diagnostics: Diagnostic[] = [], files = new Map<string, string>(), maps = new Map<string, string>();
  const locations = stories.flatMap(s => s.locations), scenes = stories.flatMap(s => s.scenes);
  const points = new Map(locations.map(location => [location.id, anchorPoints(location)]));
  const point = (map: string, anchor: string, source: Source): Point => points.get(map)?.get(anchor) ?? compileError(source, 'S022', `앵커 좌표 없음: ${map}:${anchor}`);
  let expressionWarning = false;
  const commands = (list: readonly Statement[]): unknown[] => list.flatMap(node => {
    switch (node.kind) {
      case 'dialogue':
        if (node.expression && !expressionWarning) { expressionWarning = true; diagnostics.push({ file: node.file, line: node.line, code: 'S028', level: 'warning', message: 'V3a 전이므로 대사 표정은 팩 커맨드에서 생략합니다' }); }
        return [{ cmd: 'text', text: node.text, ...(node.speaker ? { speaker: node.speaker } : {}) }];
      case 'choice': return [{ cmd: 'choice', prompt: node.prompt, options: node.options.map(option => ({ label: option.label, commands: commands(option.statements) })), cancel: null }];
      case 'if': return [{ cmd: 'if', cond: engineCondition(node.condition), then: commands(node.then), else: commands(node.else) }];
      case 'set': case 'unset': return [{ cmd: 'set_flag', flag: node.flag, value: node.kind === 'set' }];
      case 'add': case 'sub': return [{ cmd: 'set_var', var: node.variable, op: node.kind, value: node.amount }];
      case 'go': return [{ cmd: 'transfer', map: node.destination.location, marker: point(node.destination.location, node.destination.anchor, node).name, ...(node.dir ? { dir: node.dir } : {}) }];
      case 'move': return [{ cmd: 'move', target: node.target, route: [...node.route], wait: true }];
      case 'face': return [{ cmd: 'face', target: node.target, dir: node.dir }];
      case 'fade': return [{ cmd: 'fade', to: node.to, frames: node.frames }];
      case 'wait': return [{ cmd: 'wait', frames: node.frames }];
      case 'shake': return [{ cmd: 'shake' }];
      case 'call': return [{ cmd: 'call', common: node.common }];
      case 'cmd': return [node.value];
      case 'narration': case 'filmPause': case 'filmWalkTo': case 'waitNarration': return [];
    }
  });
  const eventData = (event: Event, map: string) => {
    const p = point(map, event.anchor, event);
    const attrs = { trigger: event.trigger, ...(event.character ? { character: event.character } : {}), ...(event.wander ? { wander: [...event.wander] } : {}), through: !event.character || event.trigger === 'touch' };
    const pages: unknown[] = event.pages.map((page, index) => {
      const when = page.condition ? engineCondition(page.condition) : undefined;
      const selfCondition = { self: 'story_once', is: index !== 0 };
      const condition = !event.once ? when : when ? { all: [selfCondition, when] } : selfCondition;
      const prefix: unknown[] = event.character && event.trigger === 'action' ? [{ cmd: 'face', target: 'this', dir: 'player' }] : [];
      if (event.once && index === 0) prefix.push({ cmd: 'set_self_flag', name: 'story_once', value: true });
      return { ...attrs, ...(condition ? { when: condition } : {}), commands: [...prefix, ...commands(page.statements)] };
    });
    if (event.once && event.pages.length === 1) pages.push({ ...attrs, trigger: 'none', when: { self: 'story_once', is: true }, commands: [] });
    return { id: event.id, x: p.x, y: p.y, pages };
  };
  for (const location of locations) {
    const events = scenes.filter(scene => scene.location === location.id).flatMap(scene => scene.items.filter((node): node is Event => node.kind === 'event')).map(event => eventData(event, location.id));
    const ids = new Set(events.map(event => event.id));
    for (const anchor of location.anchors) if (anchor.destination) {
      if (ids.has(anchor.name)) compileError(anchor, 'S027', `문과 이벤트 ID 충돌: ${anchor.name}`);
      ids.add(anchor.name); const p = point(location.id, anchor.name, anchor);
      events.push({ id: anchor.name, x: p.x, y: p.y, pages: [{ trigger: 'touch', through: true, commands: [{ cmd: 'transfer', map: anchor.destination.location, marker: point(anchor.destination.location, anchor.destination.anchor, anchor).name }] }] });
    }
    files.set(`maps/${location.id}.events.json`, jsonBytes({ events }));
    const filename = `maps/${location.id}.tmj`, existing = existingMaps.get(filename);
    if (existing !== undefined && !forceMaps) {
      verifyMarkers(existing, location, size); maps.set(filename, existing);
    } else { const text = jsonBytes(makeMap(location, size, tiles)); files.set(filename, text); maps.set(filename, text); }
  }
  const entry = scenes[0]?.location ?? locations[0]?.id;
  const source = scenes[0] ?? locations[0] ?? stories[0] ?? { file: 'story', line: 1 };
  if (!entry) compileError(source, 'S024', '시작 장소가 없습니다');
  const start = point(entry, 'start', source);
  const oldStart = game.start && typeof game.start === 'object' ? game.start as Record<string, unknown> : {};
  const dir = ['up', 'down', 'left', 'right'].includes(String(oldStart.dir)) ? oldStart.dir : 'down';
  const result = { ...game, state: { flags: Object.fromEntries(stories.flatMap(s => s.flags.map(flag => [flag.name, false]))), vars: Object.fromEntries(stories.flatMap(s => s.variables.map(variable => [variable.name, variable.initial]))) }, maps: locations.map(l => l.id), start: { map: entry, x: start.x, y: start.y, dir }, mapNames: Object.fromEntries(locations.map(l => [l.id, l.name])) };
  files.set('game.json', jsonBytes(result));
  files.set('common-events.json', jsonBytes(Object.fromEntries(stories.flatMap(s => s.common.map(common => [common.id, { commands: commands(common.statements) }])))));
  return { files, maps, diagnostics };
}
function makeMap(location: Location, size: number, tiles: Tiles): unknown {
  const rows = location.layout!.rows.map(row => [...row.text]), width = rows[0]!.length, height = rows.length;
  const anchors = new Map(location.anchors.map(a => [a.character, a]));
  const floor = rows.flatMap(row => row.map(c => c === '#' ? tiles.wall : anchors.get(c)?.destination ? tiles.door : tiles.floor));
  const collision = rows.flatMap(row => row.map(c => c === '#' ? tiles.wall : 0));
  const objects = location.anchors.map((anchor, i) => { const p = anchorPoints(location).get(anchor.name)!; return { id: i + 1, name: anchor.name, point: true, x: p.x * size, y: p.y * size }; });
  return { orientation: 'orthogonal', infinite: false, width, height, tilewidth: size, tileheight: size, layers: [
    { id: 1, name: 'floor', type: 'tilelayer', width, height, data: floor },
    { id: 2, name: 'collision', type: 'tilelayer', width, height, data: collision },
    { id: 3, name: 'markers', type: 'objectgroup', objects },
  ], tilesets: [{ firstgid: tiles.firstgid ?? 1, source: '../' + tiles.tileset }] };
}
export function verifyMarkers(text: string, location: Location, tileSize: number): void {
  let map: Record<string, unknown>;
  try { map = object(JSON.parse(text) as unknown); }
  catch { compileError(location, 'S023', `기존 맵 JSON 오류: ${location.id}`); }
  const found = new Map<string, { x: number; y: number }[]>();
  for (const layerValue of Array.isArray(map.layers) ? map.layers : []) {
    const layer = object(layerValue);
    if (layer.name !== 'markers' || layer.type !== 'objectgroup') continue;
    for (const value of Array.isArray(layer.objects) ? layer.objects : []) {
      const p = object(value);
      if (p.point === true && typeof p.name === 'string' && typeof p.x === 'number' && typeof p.y === 'number' && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        const list = found.get(p.name) ?? []; list.push({ x: Math.floor(p.x / tileSize), y: Math.floor(p.y / tileSize) }); found.set(p.name, list);
      }
    }
  }
  for (const anchor of location.anchors) {
    const expected = anchorPoints(location).get(anchor.name)!, values = found.get(anchor.name);
    if (values?.length !== 1 || values[0]!.x !== expected.x || values[0]!.y !== expected.y) compileError(anchor, 'S023', `기존 맵 앵커 불일치: ${location.id}:${anchor.name}`);
  }
}

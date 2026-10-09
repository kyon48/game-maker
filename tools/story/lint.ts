import { parseText, TextSyntaxError } from '../../engine/data/text';
import type { Story, Diagnostic, Source, Condition, Statement, Event, Anchor, Destination } from './ast';
export interface LintOptions { packId?: string; expressions?: ReadonlyMap<string, string> | null }
/** Pack-wide declarations and conservative reachability, without compiling engine commands. */
export function lintStories(stories: readonly Story[], options: LintOptions = {}): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const report = (source: Source, code: string, message: string, level: Diagnostic['level'] = 'error') => diagnostics.push({ file: source.file, line: source.line, code, message, level });
  const declarations = <T extends Source>(nodes: readonly T[], key: (node: T) => string, label: string, code = 'S016') => {
    const result = new Map<string, T>();
    for (const node of nodes) {
      const name = key(node);
      if (result.has(name)) report(node, code, `${label} 중복: ${name}`);
      else result.set(name, node);
    }
    return result;
  };
  const characters = declarations(stories.flatMap(s => s.characters), n => n.id, '인물 ID');
  const names = declarations([...characters.values()], n => n.name, '인물 표시 이름');
  const flags = declarations(stories.flatMap(s => s.flags), n => n.name, '플래그');
  const variables = declarations(stories.flatMap(s => s.variables), n => n.name, '변수');
  const locations = declarations(stories.flatMap(s => s.locations), n => n.id, '장소');
  const common = declarations(stories.flatMap(s => s.common), n => n.id, '공통 이벤트');
  declarations(stories.flatMap(s => s.chapters), n => n.title, '챕터 제목', 'S013');
  const startSource = stories[0] ?? { file: '<story>', line: 1 };
  const headers = stories.flatMap(s => s.headers);
  if (!headers.some(h => h.kind === 'pack')) report(startSource, 'S001', '@pack 헤더가 필요합니다');
  if (!headers.some(h => h.kind === 'player')) report(startSource, 'S001', '@player 헤더가 필요합니다');
  const firstHeader = new Map<string, string>();
  for (const header of headers) {
    const value = header.kind === 'pack' ? JSON.stringify([header.id, header.title]) : header.kind === 'player' ? header.id : `${header.width}x${header.height}`;
    if (firstHeader.has(header.kind) && firstHeader.get(header.kind) !== value) report(header, 'S016', `서로 다른 ${header.kind} 헤더`);
    firstHeader.set(header.kind, value);
    if (header.kind === 'player' && !characters.has(header.id)) report(header, 'S004', `미선언 플레이어: ${header.id}`);
    if (header.kind === 'pack' && options.packId && header.id !== options.packId) report(header, 'S016', `@pack ID가 폴더명과 다릅니다: ${header.id}`);
  }
  if (options.expressions === undefined) report(startSource, 'S015', 'artRoot가 없어 표정 이름 검사를 건너뜁니다', 'warning');
  const anchors = new Map<string, Map<string, Anchor>>(), edges = new Map<string, Set<string>>();
  for (const location of locations.values()) {
    edges.set(location.id, new Set()); const lookup = new Map<string, Anchor>(); anchors.set(location.id, lookup);
    const chars = new Set<string>(), anchorNames = new Set<string>();
    for (const anchor of location.anchors) {
      if (chars.has(anchor.character)) report(anchor, 'S010', `앵커 문자 중복: ${anchor.character}`);
      if (anchorNames.has(anchor.name)) report(anchor, 'S016', `앵커 이름 중복: ${anchor.name}`);
      chars.add(anchor.character); anchorNames.add(anchor.name);
      for (const name of new Set([anchor.name, anchor.character])) {
        if (lookup.has(name) && lookup.get(name) !== anchor) report(anchor, 'S016', `앵커 참조가 모호합니다: ${name}`);
        else lookup.set(name, anchor);
      }
    }
    const rows = location.layout?.rows;
    if (!rows?.length) { report(location, 'S001', `장소 레이아웃이 필요합니다: ${location.id}`); continue; }
    const width = [...rows[0]!.text].length; const positions = new Map<string, number>();
    for (const row of rows) {
      if ([...row.text].length !== width) report(row, 'S009', '레이아웃 행 폭이 다릅니다');
      for (const character of [...row.text]) {
        if (character === '#' || character === '.') continue;
        if (!chars.has(character)) report(row, 'S020', `선언하지 않은 레이아웃 문자: ${JSON.stringify(character)}`);
        positions.set(character, (positions.get(character) ?? 0) + 1);
        if (positions.get(character) === 2) report(row, 'S010', `레이아웃의 앵커 문자 중복: ${character}`);
      }
    }
    for (const anchor of location.anchors) if (!positions.has(anchor.character)) report(anchor, 'S020', `앵커 문자가 레이아웃에 없습니다: ${anchor.character}`);
  }
  const checkDestination = (destination: Destination, source: Source, door = false) => {
    const code = door ? 'S011' : !locations.has(destination.location) ? 'S006' : 'S005';
    if (!locations.has(destination.location)) { report(source, code, `미선언 대상 장소: ${destination.location}`); return false; }
    if (!anchors.get(destination.location)?.has(destination.anchor)) { report(source, code, `대상 앵커가 없습니다: ${destination.location}:${destination.anchor}`); return false; }
    return true;
  };
  for (const location of locations.values()) for (const anchor of location.anchors) if (anchor.destination && checkDestination(anchor.destination, anchor, true)) edges.get(location.id)!.add(anchor.destination.location);
  const scenes = stories.flatMap(s => s.scenes), events = new Map<string, Map<string, Event>>();
  for (const scene of scenes) {
    if (!locations.has(scene.location)) report(scene, 'S006', `미선언 장면 장소: ${scene.location}`);
    for (const event of scene.items) if (event.kind === 'event') {
      let local = events.get(scene.location); if (!local) { local = new Map(); events.set(scene.location, local); }
      if (local.has(event.id)) report(event, 'S016', `같은 맵의 이벤트 ID 중복: ${event.id}`);
      else local.set(event.id, event);
      if (event.character && !characters.has(event.character)) report(event, 'S004', `미선언 이벤트 인물: ${event.character}`);
      if (locations.has(scene.location) && !anchors.get(scene.location)?.has(event.anchor)) report(event, 'S005', `미선언 이벤트 앵커: ${event.anchor}`);
    }
  }
  const condition = (value: Condition, source: Source): void => {
    if (value.kind === 'flag') { if (!flags.has(value.name)) report(source, 'S002', `미선언 조건 플래그: ${value.name}`); }
    else if (value.kind === 'variable') { if (!variables.has(value.name)) report(source, 'S003', `미선언 조건 변수: ${value.name}`); }
    else for (const child of value.conditions) condition(child, source);
  };
  const textVariables = (text: string, source: Source, controls: boolean) => {
    try {
      for (const token of parseText(text, controls)) if (token.kind === 'var' && !variables.has(token.value)) report(source, 'S003', `미선언 대사 변수: ${token.value}`);
    } catch (error) { if (!(error instanceof TextSyntaxError)) throw error; /* Engine validate owns syntax and plugin registrations. */ }
  };
  const active = new Set<string>(), results = new Map<string, ReadonlySet<string>>();
  const walk = (list: readonly Statement[], scope: ReadonlySet<string>, trackReachability = true): Set<string> => {
    let maps = new Set(scope);
    for (const node of list) {
      switch (node.kind) {
        case 'dialogue':
          textVariables(node.text, node, true);
          if (node.speaker) textVariables(node.speaker, node, false);
          if (node.speaker && !names.has(node.speaker)) report(node, 'S004', `미선언 화자: ${node.speaker}`);
          if (node.expression && options.expressions && !options.expressions.has(node.expression.trim().toLocaleLowerCase('en-US'))) report(node, 'S007', `모르는 표정: ${node.expression}`);
          break;
        case 'narration': if ([...node.text].length > 90) report(node, 'S014', '나레이션이 90자를 넘습니다', 'warning'); break;
        case 'set': case 'unset': if (!flags.has(node.flag)) report(node, 'S002', `미선언 플래그: ${node.flag}`); break;
        case 'add': case 'sub': if (!variables.has(node.variable)) report(node, 'S003', `미선언 변수: ${node.variable}`); break;
        case 'if': {
          condition(node.condition, node);
          maps = new Set([...walk(node.then, maps, trackReachability), ...walk(node.else, maps, trackReachability)]); break;
        }
        case 'choice': {
          textVariables(node.prompt, node, false);
          for (const option of node.options) textVariables(option.label, option, false);
          if (node.options.length > 6) report(node, 'S008', '선택지는 최대 6개입니다');
          maps = new Set(node.options.flatMap(option => [...walk(option.statements, maps, trackReachability)])); break;
        }
        case 'go':
          if (checkDestination(node.destination, node)) {
            if (trackReachability) for (const map of maps) edges.get(map)?.add(node.destination.location);
            maps = new Set([node.destination.location]);
          }
          break;
        case 'filmWalkTo': {
          const candidates = maps.size ? [...maps] : [...locations.keys()];
          if (!candidates.some(map => anchors.get(map)?.has(node.anchor))) report(node, 'S005', `미선언 촬영 앵커: ${node.anchor}`);
          break;
        }
        case 'move': case 'face': {
          if (node.target === 'this' || node.target === 'player') break;
          const candidates = maps.size ? [...maps] : [...locations.keys()];
          if (!candidates.some(map => events.get(map)?.has(node.target))) report(node, 'S017', `미선언 이동/방향 대상: ${node.target}`);
          break;
        }
        case 'call': {
          const target = common.get(node.common);
          if (!target) { report(node, 'S018', `미선언 공통 이벤트: ${node.common}`); break; }
          const key = JSON.stringify([node.common, [...maps].sort(), trackReachability]);
          if (results.has(key)) maps = new Set(results.get(key));
          else if (!active.has(key)) { active.add(key); maps = walk(target.statements, maps, trackReachability); active.delete(key); results.set(key, new Set(maps)); }
          break;
        }
        // raw JSON remains opaque: S1b's engine validator owns its content.
        case 'cmd': case 'wait': case 'shake': case 'fade': case 'filmPause': case 'waitNarration': break;
      }
    }
    return maps;
  };
  const changesFlags = (list: readonly Statement[], seen = new Set<string>()): boolean => list.some(node => {
    if (node.kind === 'set' || node.kind === 'unset') return true;
    if (node.kind === 'if') return changesFlags(node.then, seen) || changesFlags(node.else, seen);
    if (node.kind === 'choice') return node.options.some(o => changesFlags(o.statements, seen));
    if (node.kind === 'call' && !seen.has(node.common)) {
      const next = new Set(seen); next.add(node.common);
      return changesFlags(common.get(node.common)?.statements ?? [], next);
    }
    return false;
  });
  for (const scene of scenes) for (const node of scene.items) {
    if (node.kind === 'event') {
      if (node.film === 'skip' && node.pages.some(p => changesFlags(p.statements))) report(node, 'S033', 'film=skip 이벤트의 플래그 변경은 촬영 경로와 장면 expect에 포함되지 않습니다', 'warning');
      for (const page of node.pages) { if (page.condition) condition(page.condition, page); walk(page.statements, new Set([scene.location])); }
    }
    else walk([node], new Set([scene.location]));
  }
  // Uncalled declarations must still have valid references; no entry map is assumed.
  for (const value of common.values()) walk(value.statements, new Set(), false);
  const entry = scenes[0]?.location ?? locations.keys().next().value as string | undefined;
  if (entry && locations.has(entry)) {
    const reached = new Set([entry]), queue = [entry];
    for (const map of queue) for (const target of edges.get(map) ?? []) if (!reached.has(target)) { reached.add(target); queue.push(target); }
    for (const location of locations.values()) if (!reached.has(location.id)) report(location, 'S012', `입장 장소에서 도달할 수 없는 장소: ${location.id}`);
  }
  const unique = new Map(diagnostics.map(d => [JSON.stringify([d.file, d.line, d.code, d.message]), d]));
  return [...unique.values()].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
}

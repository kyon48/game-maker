import type { Source, Statement, Dir, Destination } from './ast';
export const idPattern = /^[a-z][a-z0-9_]*$/;
export const dirs = new Set(['up', 'down', 'left', 'right']);
export interface Token { value: string; quoted: boolean }
export function tokens(text: string): Token[] {
  const result: Token[] = []; let cursor = 0;
  while (cursor < text.length) {
    if (/\s/.test(text[cursor]!)) { cursor++; continue; }
    const quoted = text[cursor] === '"';
    const match = (quoted ? /^"(?:[^"\\]|\\.)*"/ : /^[^\s"]+/).exec(text.slice(cursor));
    if (!match) throw new Error('따옴표가 닫히지 않았습니다');
    result.push({ value: quoted ? JSON.parse(match[0]) as string : match[0], quoted }); cursor += match[0].length;
    if (cursor < text.length && !/\s/.test(text[cursor]!)) throw new Error('항목 사이에 공백이 필요합니다');
  }
  return result;
}
export function id(value: string): string { if (!idPattern.test(value)) throw new Error(`ID 형식 오류: ${value}`); return value; }
export function integer(value: string, positive = false): number {
  if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || (positive && Number(value) < 1)) throw new Error('안전 정수' + (positive ? '(1 이상)' : '') + '가 필요합니다');
  return Number(value);
}
export function seconds(value: string): number {
  if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value))) throw new Error('0 이상의 초 값이 필요합니다');
  return Number(value);
}
export function direction(value: string): Dir { if (!dirs.has(value)) throw new Error(`방향 오류: ${value}`); return value as Dir; }
export function destination(value: string): Destination {
  const match = /^([a-z][a-z0-9_]*):([^\s:]+)$/.exec(value);
  if (!match) throw new Error('맵:앵커 형식이 필요합니다');
  return { location: match[1]!, anchor: match[2]! };
}
export function route(value: string): string[] {
  const result = value.split(',');
  for (const token of result) {
    if (!/^(up|down|left|right|face:(up|down|left|right)|wait:[1-9]\d*)$/.test(token) || (token.startsWith('wait:') && !Number.isSafeInteger(Number(token.slice(5))))) throw new Error(`이동 토큰 오류: ${token}`);
  }
  return result;
}
export function options(values: Token[], allowed: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const token of values) {
    const match = /^([a-z]+)=(.+)$/.exec(token.value);
    if (token.quoted || !match || !allowed.includes(match[1]!) || Object.hasOwn(result, match[1]!)) throw new Error(`옵션 오류: ${token.value}`);
    result[match[1]!] = match[2]!;
  }
  return result;
}
export function simple(text: string, source: Source): Statement {
  if (text.startsWith('> ')) return { ...source, kind: 'narration', text: text.slice(2).trim() || fail('나레이션이 비었습니다') };
  const dialogue = /^([^:()]*?)(?:\(([^()]+)\))?:\s*(.+)$/.exec(text);
  if (dialogue && !text.startsWith('@')) {
    const speaker = dialogue[1]!.trim() || undefined, expression = dialogue[2]?.trim();
    if (expression && !speaker) throw new Error('화자 없이 표정을 지정할 수 없습니다');
    return { ...source, kind: 'dialogue', speaker, expression, text: dialogue[3]! };
  }
  const raw = /^@cmd\s+(.+)$/.exec(text);
  if (raw) return { ...source, kind: 'cmd', value: JSON.parse(raw[1]!) as unknown };
  const t = tokens(text).map(token => token.value), [command, a, b] = t;
  if (command === '@shake' || command === '@waitNarration') {
    if (t.length !== 1) throw new Error('인자 없는 명령입니다');
    return { ...source, kind: command === '@shake' ? 'shake' : 'waitNarration' };
  }
  if (command === '@set' || command === '@unset') {
    if (t.length !== 2) throw new Error('플래그 이름 한 개가 필요합니다');
    return { ...source, kind: command === '@set' ? 'set' : 'unset', flag: id(a!) };
  }
  if (command === '@add' || command === '@sub') {
    if (t.length !== 3) throw new Error('변수 이름과 정수가 필요합니다');
    return { ...source, kind: command === '@add' ? 'add' : 'sub', variable: id(a!), amount: integer(b!) };
  }
  if (command === '@go') {
    if (t.length < 2 || t.length > 3) throw new Error('맵:앵커와 선택 방향이 필요합니다');
    return { ...source, kind: 'go', destination: destination(a!), dir: b === undefined ? undefined : direction(b) };
  }
  if (command === '@move') {
    if (t.length !== 3) throw new Error('대상과 쉼표로 구분한 이동 경로가 필요합니다');
    return { ...source, kind: 'move', target: id(a!), route: route(b!) };
  }
  if (command === '@face') {
    if (t.length !== 3) throw new Error('대상과 방향이 필요합니다');
    return { ...source, kind: 'face', target: id(a!), dir: b === 'player' ? b : direction(b!) };
  }
  if (command === '@fade') {
    if (t.length !== 3 || (a !== 'black' && a !== 'clear')) throw new Error('black/clear와 대기 틱이 필요합니다');
    return { ...source, kind: 'fade', to: a, frames: integer(b!, true) };
  }
  if (command === '@wait') {
    if (t.length !== 2) throw new Error('대기 틱 한 개가 필요합니다');
    return { ...source, kind: 'wait', frames: integer(a!, true) };
  }
  if (command === '@call') {
    if (t.length !== 2) throw new Error('공통 이벤트 ID 한 개가 필요합니다');
    return { ...source, kind: 'call', common: id(a!) };
  }
  if (command === '@film') {
    if (t.length !== 3) throw new Error('촬영 힌트 형식 오류');
    if (a === 'pause') return { ...source, kind: 'filmPause', seconds: seconds(b!) };
    if (a === 'walkTo') return { ...source, kind: 'filmWalkTo', anchor: b! };
  }
  throw new Error(`문법을 해석할 수 없습니다: ${command ?? text}`);
}
function fail(message: string): never { throw new Error(message); }

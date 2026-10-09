import type { Condition } from './ast';
/** Recursive condition grammar; no eval or engine command compilation. */
export function parseCondition(text: string): Condition {
  let cursor = 0;
  const ws = () => { while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor++; };
  const consume = (value: string) => { ws(); if (text.startsWith(value, cursor)) { cursor += value.length; return true; } return false; };
  const parse = (): Condition => {
    ws(); const enabled = !consume('!');
    const match = /^[a-z][a-z0-9_]*/.exec(text.slice(cursor));
    if (!match) throw new Error('조건의 이름이 필요합니다');
    const name = match[0]; cursor += name.length;
    if (consume('(')) {
      if (!enabled || (name !== 'all' && name !== 'any')) throw new Error('조건 함수는 all/any만 허용합니다');
      const conditions: Condition[] = [];
      if (!consume(')')) {
        do { conditions.push(parse()); } while (consume(','));
        if (!consume(')')) throw new Error('조건의 닫는 괄호가 필요합니다');
      }
      return { kind: name, conditions };
    }
    ws(); const op = /^(>=|<=|==|!=|>|<)/.exec(text.slice(cursor));
    if (op) {
      if (!enabled) throw new Error('!는 플래그에만 사용합니다');
      cursor += op[0].length; ws(); const number = /^-?\d+/.exec(text.slice(cursor));
      if (!number || !Number.isSafeInteger(Number(number[0]))) throw new Error('비교 값은 안전 정수여야 합니다');
      cursor += number[0].length;
      return { kind: 'variable', name, op: op[0] as Extract<Condition, { kind: 'variable' }>['op'], value: Number(number[0]) };
    }
    return { kind: 'flag', name, enabled };
  };
  const result = parse(); ws();
  if (cursor !== text.length) throw new Error('조건 뒤에 해석하지 못한 문자가 있습니다');
  return result;
}

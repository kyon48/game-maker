export type TextToken = { offset: number } & (
  | { kind: 'text'; value: string }
  | { kind: 'var' | 'plugin' | 'color'; value: string }
  | { kind: 'wait' | 'speed'; value: number }
);
export class TextSyntaxError extends Error {
  constructor(readonly offset: number, message: string) { super(`${message} (offset ${offset})`); }
}
/** Offsets are UTF-16 string indices, usable by both JSON diagnostics and story lint. */
export function parseText(text: string, controls = true): TextToken[] {
  const result: TextToken[] = [];
  const fail = (offset: number, message: string): never => { throw new TextSyntaxError(offset, message); };
  for (let i = 0; i < text.length;) {
    const offset = i, char = text[i]!;
    if ((char === '{' || char === '}') && text[i + 1] === char) { result.push({ kind: 'text', value: char, offset }); i += 2; continue; }
    if (char === '}') fail(i, 'Unescaped brace: use }} for a literal } (use {{ for a literal {)');
    if (char !== '{') { const value = String.fromCodePoint(text.codePointAt(i)!); result.push({ kind: 'text', value, offset }); i += value.length; continue; }
    const end = text.indexOf('}', i + 1);
    if (end < 0) fail(i, 'Unclosed substitution: use {{ for a literal {');
    const expression = text.slice(i + 1, end), colon = expression.indexOf(':');
    const kind = colon < 0 ? expression : expression.slice(0, colon), value = colon < 0 ? '' : expression.slice(colon + 1);
    if (!['var', 'plugin', 'wait', 'color', 'speed'].includes(kind)) fail(i, 'Unknown substitution: use {{ for a literal {');
    if (!controls && ['wait', 'color', 'speed'].includes(kind)) fail(i, 'wait/color/speed are only allowed in text bodies');
    if (kind === 'var' || kind === 'plugin') {
      if (!(kind === 'var' ? /^[a-z][a-z0-9_]*$/ : /^x_[a-z0-9_]+$/).test(value)) fail(i, `Invalid ${kind} name`);
      result.push({ kind, value, offset });
    } else if (kind === 'color') {
      if (colon >= 0 && (!value || /[{}]/.test(value))) fail(i, 'Invalid color name');
      result.push({ kind, value, offset });
    } else {
      const number = Number(value);
      if (colon < 0 || (kind === 'wait' ? !/^\d+$/.test(value) || !Number.isSafeInteger(number) : !/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value) || !Number.isFinite(number) || number <= 0)) fail(i, `Invalid ${kind} argument`);
      result.push({ kind: kind as 'wait' | 'speed', value: number, offset });
    }
    i = end + 1;
  }
  return result;
}
export interface DisplaySegment { readonly text: string; readonly color?: string; readonly speed: number; readonly wait: number }
export interface TextResolver { variable(name: string): string; plugin(name: string): string; color?(name: string): boolean }
export function resolveText(text: string, resolver: TextResolver, controls = true): { segments: DisplaySegment[]; plainText: string } {
  const segments: DisplaySegment[] = [];
  let color: string | undefined, speed = 1, wait = 0;
  for (const token of parseText(text, controls)) {
    if (token.kind === 'color') {
      if (token.value && resolver.color && !resolver.color(token.value)) throw new TextSyntaxError(token.offset, `Unknown color: ${token.value}`);
      color = token.value || undefined;
    } else if (token.kind === 'speed') speed = token.value;
    else if (token.kind === 'wait') { wait += token.value; if (!Number.isSafeInteger(wait)) throw new TextSyntaxError(token.offset, 'Unsafe total wait'); }
    else {
      const value = token.kind === 'var' ? resolver.variable(token.value) : token.kind === 'plugin' ? resolver.plugin(token.value) : token.value;
      if (typeof value !== 'string') throw new Error('Text substitution must return a string');
      for (const point of value) { segments.push({ text: point, color, speed, wait }); wait = 0; }
    }
  }
  if (wait) segments.push({ text: '', color, speed, wait });
  return { segments, plainText: segments.map(s => s.text).join('') };
}
/** V2 uses this exact resolution path for its voice cache key. */
export const plainText = (text: string, resolver: TextResolver, controls = true): string => resolveText(text, resolver, controls).plainText;

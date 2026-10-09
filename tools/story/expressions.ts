/** Read the asset manifest shape, keeping alias normalization separate from IO. */
export function expressionAliases(value: unknown): ReadonlyMap<string, string> {
  const record = (v: unknown): Record<string, unknown> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('표정 매니페스트 객체가 필요합니다');
    return v as Record<string, unknown>;
  };
  const root = record(value);
  if (!Array.isArray(root.expressions)) throw new Error('expressions 배열이 필요합니다');
  const aliases = new Map<string, string>(), keys = new Set<string>();
  const add = (alias: unknown, key: string) => {
    if (typeof alias !== 'string' || !alias.trim()) throw new Error('표정 별칭은 비어 있지 않은 문자열이어야 합니다');
    const name = alias.trim().toLocaleLowerCase('en-US');
    if (aliases.has(name) && aliases.get(name) !== key) throw new Error(`표정 별칭 중복: ${alias}`);
    aliases.set(name, key);
  };
  for (const entry of root.expressions) {
    const expression = record(entry);
    if (typeof expression.key !== 'string' || !/^[a-z][a-z0-9_]*$/.test(expression.key) || keys.has(expression.key)) throw new Error('표정 key 형식/중복 오류');
    keys.add(expression.key);
    for (const field of ['key', 'en', 'ko']) add(expression[field], expression.key);
  }
  if (root.core !== undefined) for (const [alias, key] of Object.entries(record(root.core))) {
    if (typeof key !== 'string' || !keys.has(key)) throw new Error(`core 대상 key가 없습니다: ${alias}`);
    add(alias, key);
  }
  return aliases;
}

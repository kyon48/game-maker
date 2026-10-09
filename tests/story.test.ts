import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { parseStory } from '../tools/story/parser';
import { lintStories } from '../tools/story/lint';
import { parseCondition } from '../tools/story/conditions';
import { expressionAliases } from '../tools/story/expressions';
const valid = await readFile('tests/fixtures/story/valid.story.md', 'utf8');
const catalog = { expressions: [
  { key: 'suspicious', en: 'Suspicious', ko: '의심' }, { key: 'determined', en: 'Determined', ko: '결의' },
  { key: 'soft_smile', en: 'Soft Smile', ko: '부드러운 미소' }, { key: 'unimpressed', en: 'Unimpressed', ko: '시큰둥' },
  { key: 'neutral', en: 'Neutral', ko: '무표정' }, { key: 'startled', en: 'Startled', ko: '깜짝' },
], core: { surprised: 'startled', neutral: 'neutral' } };
const expressions = expressionAliases(catalog);
function lint(text: string) { const { story, diagnostics } = parseStory(text, 'valid.story.md'); return [...diagnostics, ...lintStories([story], { expressions, packId: 'lantern' })]; }
function line(text: string, fragment: string): number { return text.split('\n').findIndex(row => row.includes(fragment)) + 1; }
it('parses the three-scene fixture, every DSL command and preserves locations on nested AST nodes', () => {
  const { story, diagnostics } = parseStory(valid, 'valid.story.md'); expect(diagnostics).toEqual([]); expect(lint(valid)).toEqual([]);
  expect(story.scenes.map(s => s.location)).toEqual(['pier', 'tower', 'garden']); expect(story.headers.map(h => h.kind)).toEqual(['pack', 'player', 'screen']);
  expect(story.locations[0]?.layout?.rows[2]).toMatchObject({ text: '#...e......x', line: 14 });
  const first = story.scenes[0]!.items.find(n => n.kind === 'event')!; expect(first.kind).toBe('event');
  if (first.kind !== 'event') throw new Error('Expected event');
  expect(first).toMatchObject({ line: line(valid, '@event elder'), trigger: 'action', wander: ['left', 'wait:60', 'right', 'wait:60'] });
  expect(first.pages).toHaveLength(2); expect(first.pages[1]?.condition).toEqual({ kind: 'flag', name: 'met_elder', enabled: true });
  const choice = first.pages[0]!.statements[2]!; if (choice.kind !== 'choice') throw new Error('Expected choice');
  expect(choice.line).toBe(line(valid, '? 뭐라고')); expect(choice.options.map(o => o.chosen)).toEqual([true, false]);
  const nested = choice.options[0]!.statements[2]!; if (nested.kind !== 'if') throw new Error('Expected if');
  expect(nested.then[0]).toMatchObject({ kind: 'dialogue', expression: '부드러운 미소', line: line(valid, '그렇다면 도와주지') });
  expect(nested.else[0]).toMatchObject({ kind: 'sub', variable: 'trust', amount: 1 });
  expect(story.common[0]?.statements.map(n => n.kind)).toEqual(['fade', 'wait', 'fade', 'shake', 'dialogue']);
});
const variants: [string, string, (text: string) => string, string][] = [
  ['unknown directive', 'S001', s => s.replace('@wait 60', '@teleport nowhere'), '@teleport'],
  ['invalid JSON', 'S001', s => s.replace('{"cmd":"show_map_name"}', '{"cmd":}'), '@cmd'],
  ['undeclared flag', 'S002', s => s.replace('@set met_elder', '@set missing'), '@set missing'],
  ['undeclared variable', 'S003', s => s.replace('@add trust 1', '@add missing 1'), '@add missing'],
  ['undeclared speaker', 'S004', s => s.replace('촌장(의심)', '낯선이(의심)'), '낯선이'],
  ['undeclared event character', 'S004', s => s.replace('character=elder', 'character=missing'), 'character=missing'],
  ['undeclared anchor', 'S005', s => s.replace('at elder_spot', 'at missing'), 'at missing'],
  ['undeclared location', 'S006', s => s.replace('돌아보다 @ garden', '돌아보다 @ missing'), '@ missing'],
  ['unknown expression', 'S007', s => s.replace('소라(결의)', '소라(없음)'), '소라(없음)'],
  ['seven options', 'S008', s => s.replace('    * 돌아선다', Array.from({ length: 5 }, (_, i) => `    * 대안${i}`).join('\n') + '\n    * 돌아선다'), '? 뭐라고'],
  ['uneven layout width', 'S009', s => s.replace('#..........#', '#.........#'), '#.........#'],
  ['duplicate anchor glyph', 'S010', s => s.replace('#..........#', '#e.........#'), '#...e......x'],
  ['duplicate anchor declaration', 'S010', s => s.replace('@anchor s = start', '@anchor s = start\n@anchor s = spare'), '@anchor s = spare'],
  ['door destination map', 'S011', s => s.replace('-> tower:w', '-> absent:w'), 'absent:w'],
  ['door destination anchor', 'S011', s => s.replace('-> tower:w', '-> tower:missing'), 'tower:missing'],
  ['unreachable location', 'S012', s => s.replace('@location garden', '@location isolated "숨은 방"\n@layout\n###\n#s#\n###\n@end\n@anchor s = start\n\n@location garden'), '@location isolated'],
  ['duplicate chapter title', 'S013', s => s.replace('## 2장. 작은 불씨', '## 1장. 꺼진 불빛'), '## 1장. 꺼진 불빛'],
  ['unknown move target', 'S017', s => s.replace('@move player', '@move missing'), '@move missing'],
  ['unknown common event', 'S018', s => s.replace('@call light_room', '@call missing'), '@call missing'],
  ['undeclared layout glyph', 'S020', s => s.replace('#..........#', '#q.........#'), '#q.........#'],
];
it.each(variants)('%s fails with %s and a source line', (_name, code, mutate, fragment) => {
  const text = mutate(valid), diagnostics = lint(text), error = diagnostics.find(d => d.code === code);
  expect(error).toBeDefined(); expect(error?.level).toBe('error'); expect(error?.file).toBe('valid.story.md');
  if (code !== 'S013') expect(error?.line).toBe(line(text, fragment));
  else expect(error?.line).toBe(text.split('\n').map(row => row.includes(fragment)).lastIndexOf(true) + 1);
});
it('warns for narration over 90 code points and checks the exact boundary', () => {
  const ninety = valid.replace('안개 낀 선착장. 소라는 불이 꺼진 등대를 바라보았습니다.', '😀'.repeat(90));
  expect(lint(ninety)).toEqual([]);
  const longer = ninety.replace('😀'.repeat(90), '😀'.repeat(91));
  expect(lint(longer)).toContainEqual(expect.objectContaining({ code: 'S014', level: 'warning', line: line(longer, '😀') }));
});
it('skips expression checks without artRoot with a single warning for the whole pack', () => {
  const one = parseStory(valid.replace('(의심)', '(not_known)'), 'a.story.md').story;
  const two = parseStory('## 별도 장\n### 새 장면 @ garden\n> 다른 날', 'b.story.md').story;
  const diagnostics = lintStories([one, two]); expect(diagnostics).toHaveLength(1); expect(diagnostics[0]).toMatchObject({ code: 'S015', level: 'warning' });
});
it('accepts key, English, Korean and core aliases and normalizes them to a canonical key', () => {
  expect(expressions.get('의심')).toBe('suspicious'); expect(expressions.get('soft smile')).toBe('soft_smile'); expect(expressions.get('surprised')).toBe('startled');
  for (const expression of ['suspicious', 'Suspicious', '의심', 'surprised']) expect(lint(valid.replace('촌장(의심)', `촌장(${expression})`))).toEqual([]);
});
it('raw commands only parse JSON and leave unknown fields/commands/types for S1b', () => {
  for (const value of ['{"cmd":"not_registered","extra":true}', '[1,2]', 'null']) {
    const text = valid.replace('{"cmd":"show_map_name"}', value); expect(lint(text)).toEqual([]);
    const event = parseStory(text).story.scenes[1]!.items[0]!; if (event.kind !== 'event') throw new Error('Expected event');
    expect(event.pages[0]?.statements.find(n => n.kind === 'cmd')).toMatchObject({ kind: 'cmd', value: JSON.parse(value) as unknown });
  }
});
it.each(['all(flag,any(!other,var>=3))', 'all()', 'any()', '!flag', 'var<-2', 'var!=0'])('parses the complete recursive condition %s', text => { expect(() => parseCondition(text)).not.toThrow(); });
it.each(['all(flag,)', 'all(!)', 'var>1.2', '!var>=1', 'var=1', 'not(flag)', 'all(flag', 'flag suffix', 'var>=9007199254740992'])('rejects malformed condition %s', text => { expect(() => parseCondition(text)).toThrow(); });
it.each([
  (s: string) => s.replace('      @set met_elder', '       @set met_elder'),
  (s: string) => s.replace('  @wait 60', '\t@wait 60'),
  (s: string) => s.replace('@screen 480x270', '@screen 0x270'),
  (s: string) => s.replace('trigger=action', 'trigger=parallel'),
  (s: string) => s.replace('wander=left,wait:60,right,wait:60', 'wander=diagonal'),
  (s: string) => s.replace('@wait 60', '@wait 0'),
  (s: string) => s.replace('@face player up', '@face player northwest'),
  (s: string) => s.replace('@go pier:start', '@go pier:start down extra'),
  (s: string) => s.replace('@page when=met_elder', '@page when=all(met_elder'),
  (s: string) => s.replace('    * 돌아선다', '    *> 돌아선다'),
])('rejects invalid syntax or indentation without throwing from the parser', mutate => { expect(lint(mutate(valid)).some(d => d.code === 'S001')).toBe(true); });
it('retains CRLF/BOM line numbers, escapes in quoted headers, and colons inside text', () => {
  const text = '\uFEFF' + valid.replace('"등대지기의 약속"', '"등대지기의 \\"약속\\""').replace('불을 다시 켜야 합니다.', '메모: 불을 다시 켜야 합니다.').replaceAll('\n', '\r\n');
  const result = parseStory(text); expect(result.diagnostics).toEqual([]); expect(result.story.headers[0]).toMatchObject({ title: '등대지기의 "약속"', line: 1 });
});
it('reports missing and stray closing directives with recoverable line numbers', () => {
  const text = valid.replace('  @shake', '  @if met_elder\n    @shake');
  expect(lint(text).some(d => d.code === 'S001')).toBe(true); expect(parseStory('@end').diagnostics[0]?.line).toBe(1);
});
it('checks names inside nested conditions, common events and alternate pages', () => {
  expect(lint(valid.replace('any(trust>=1,!lamp_lit)', 'any(absent>=1,!missing)')).map(d => d.code)).toEqual(expect.arrayContaining(['S002', 'S003']));
  expect(lint(valid.replace('@page when=met_elder', '@page when=unknown'))).toContainEqual(expect.objectContaining({ code: 'S002', line: line(valid, '@page') }));
  expect(lint(valid.replace('  : 잠시 바람', '  없는이: 잠시 바람'))).toContainEqual(expect.objectContaining({ code: 'S004' }));
});
it('shares declarations across input files while diagnosing conflicting headers and duplicate names', () => {
  const second = parseStory('@pack different "제목"\n@character other "소라"\n@flag met_elder', 'second.story.md');
  expect(lintStories([parseStory(valid).story, second.story], { expressions }).filter(d => d.code === 'S016')).toHaveLength(3);
});
it('common transfers update the caller map for every call, not just the first', () => {
  const text = valid + '\n@common travel\n  @go garden:entry\n@end\n## 추가 장\n### 두 여행 @ pier\n@event one at start\n  @call travel\n  @film walkTo bench\n@end\n@event two at start\n  @call travel\n  @film walkTo bench\n@end\n';
  expect(lint(text)).toEqual([]);
});
it('rejects broken expression manifest structure or ambiguous aliases', () => {
  expect(() => expressionAliases({})).toThrow(); expect(() => expressionAliases({ ...catalog, core: { surprised: 'missing' } })).toThrow();
  expect(() => expressionAliases({ expressions: [{ key: 'one', en: 'Same', ko: '하나' }, { key: 'two', en: 'Same', ko: '둘' }] })).toThrow('중복');
});
it('uncalled common-event travel cannot make an otherwise disconnected location reachable', () => {
  const text = valid + '\n@location secret "숨은 방"\n@layout\n###\n#s#\n###\n@end\n@anchor s = start\n@common unused\n  @go pier:start\n  @go secret:start\n@end\n';
  expect(lint(text)).toContainEqual(expect.objectContaining({ code: 'S012', line: line(text, '@location secret') }));
});
it('only directed doors and explicit go/call paths establish reachability', () => {
  const text = valid.replace(' -> tower:w', '').replace('  @go garden:entry down', '  @go tower:entry down');
  expect(lint(text)).toContainEqual(expect.objectContaining({ code: 'S012', line: line(text, '@location tower') }));
  const connected = text.replace('@sub trust 1', '@sub trust 1\n        @go tower:entry');
  expect(lint(connected).some(d => d.code === 'S012')).toBe(false);
});
it('nested choices, three pages, empty branches and recursive common calls produce finite AST/lint results', () => {
  const text = valid.replace('      @set met_elder', '      ? 안쪽 질문\n        * 대답\n          @set met_elder').replace('@page when=met_elder', '@page when=all()\n  : 첫 안내\n@page when=any()\n  : 둘째 안내\n@page when=met_elder') + '\n@common loop\n  @call loop\n@end\n';
  expect(lint(text)).toEqual([]);
});
it('unknown player, empty layout, ambiguous anchor aliases and missing layout glyphs are diagnosed', () => {
  expect(lint(valid.replace('@player sora', '@player other'))).toContainEqual(expect.objectContaining({ code: 'S004' }));
  expect(lint(valid.replace('############\n#..........#\n#...e......x\n#.s........#\n############', ''))).toContainEqual(expect.objectContaining({ code: 'S001' }));
  expect(lint(valid.replace('@anchor x = to_tower', '@anchor x = elder_spot'))).toContainEqual(expect.objectContaining({ code: 'S016' }));
  expect(lint(valid.replace('@anchor x = to_tower', '@anchor x = e'))).toContainEqual(expect.objectContaining({ code: 'S016' }));
  expect(lint(valid.replace('#...e......x', '#..........x'))).toContainEqual(expect.objectContaining({ code: 'S020' }));
});
it('a tab before an option or page is a syntax error as well as before a statement', () => {
  for (const text of [valid.replace('    * 돌아선다', '\t* 돌아선다'), valid.replace('@page when=', '\t@page when=')]) expect(lint(text).some(d => d.code === 'S001')).toBe(true);
});

import type { Story, Source, Statement, Event, Page, Option, Diagnostic, Location, Scene } from './ast';
import { parseCondition } from './conditions';
import { tokens, id, integer, options, route, destination, simple } from './syntax';
interface Line extends Source { text: string; raw: string; indent: number }
export function parseStory(text: string, file = '<story>'): { story: Story; diagnostics: Diagnostic[] } {
  const parser = new Parser(text, file); parser.parse();
  return { story: parser.story, diagnostics: parser.diagnostics };
}
class Parser {
  readonly story: Story;
  readonly diagnostics: Diagnostic[] = [];
  private readonly lines: Line[];
  private cursor = 0;
  private location?: Location;
  private scene?: Scene;
  private chapter?: string;
  constructor(text: string, file: string) {
    this.story = { file, line: 1, headers: [], characters: [], flags: [], variables: [], locations: [], chapters: [], scenes: [], common: [] };
    this.lines = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map((raw, i) => ({ raw, text: raw.trim(), indent: raw.match(/^ */)![0].length, file, line: i + 1 }));
    for (const line of this.lines) if (/^ *\t/.test(line.raw)) this.error(line, '들여쓰기에 탭을 사용할 수 없습니다');
  }
  private error(source: Source, message: string): void { this.diagnostics.push({ ...this.source(source), level: 'error', code: 'S001', message }); }
  private source(source: Source): Source { return { file: source.file, line: source.line }; }
  private peek(): Line | undefined {
    while (this.lines[this.cursor]?.text === '') this.cursor++;
    return this.lines[this.cursor];
  }
  private attempt(line: Line, action: () => void): void {
    try { action(); }
    catch (error) { this.error(line, error instanceof Error ? error.message : String(error)); }
  }
  parse(): void {
    for (let line = this.peek(); line; line = this.peek()) {
      this.cursor++;
      this.attempt(line, () => {
        if (line.indent !== 0) throw new Error('최상위 줄의 들여쓰기가 잘못되었습니다');
        this.top(line);
      });
    }
  }
  private top(line: Line): void {
    const src = this.source(line), text = line.text;
    const scene = /^###\s+(.+?)\s+@\s+([a-z][a-z0-9_]*)$/.exec(text);
    if (scene) {
      this.location = undefined;
      this.scene = { ...src, title: scene[1]!, location: scene[2]!, chapter: this.chapter, items: [] }; this.story.scenes.push(this.scene); return;
    }
    const chapter = /^##\s+(.+)$/.exec(text);
    if (chapter) { this.scene = undefined; this.location = undefined; this.chapter = chapter[1]!; this.story.chapters.push({ ...src, title: this.chapter }); return; }
    if (text === '@layout') { this.layout(line); return; }
    const anchor = /^@anchor\s+(\S+)\s*=\s*([a-z][a-z0-9_]*)(?:\s+->\s+(\S+))?$/.exec(text);
    if (anchor) {
      if (!this.location) throw new Error('@anchor는 장소 선언 뒤에 와야 합니다');
      const character = anchor[1]!;
      if ([...character].length !== 1 || /^[.#\s]$/.test(character)) throw new Error('앵커 문자는 벽/바닥을 제외한 한 글자여야 합니다');
      this.location.anchors.push({ ...src, character, name: anchor[2]!, destination: anchor[3] ? destination(anchor[3]) : undefined }); return;
    }
    if (text.startsWith('@event ')) {
      if (!this.scene) throw new Error('@event는 장면 안에 선언합니다');
      this.scene.items.push(this.event(line)); return;
    }
    if (text.startsWith('@common ')) {
      const t = tokens(text);
      if (t.length !== 2) throw new Error('공통 이벤트 ID 한 개가 필요합니다');
      const name = id(t[1]!.value), statements = this.body(line.indent); this.end(line);
      this.story.common.push({ ...src, id: name, statements }); return;
    }
    if (text.startsWith('>') || text.startsWith('@film ') || text === '@waitNarration') {
      if (!this.scene) throw new Error('촬영/나레이션 줄은 장면 안에 선언합니다');
      this.scene.items.push(simple(text, src)); return;
    }
    const t = tokens(text), values = t.map(token => token.value), [command, a, b] = values;
    const count = (n: number) => { if (t.length !== n) throw new Error('헤더 인자 수가 잘못되었습니다'); };
    const quoted = () => { if (!t[2]?.quoted || !b?.trim()) throw new Error('비어 있지 않은 큰따옴표 문자열이 필요합니다'); };
    if (command === '@pack') { count(3); quoted(); this.story.headers.push({ ...src, kind: 'pack', id: id(a!), title: b! }); return; }
    if (command === '@player') { count(2); this.story.headers.push({ ...src, kind: 'player', id: id(a!) }); return; }
    if (command === '@screen') {
      count(2); const match = /^(\d+)x(\d+)$/.exec(a!);
      if (!match) throw new Error('화면은 너비x높이 형식입니다');
      this.story.headers.push({ ...src, kind: 'screen', width: integer(match[1]!, true), height: integer(match[2]!, true) }); return;
    }
    if (command === '@character') {
      if (t.length < 3) throw new Error('인물 ID와 표시 이름이 필요합니다'); quoted();
      const attrs = options(t.slice(3), ['art', 'voice']);
      this.story.characters.push({ ...src, id: id(a!), name: b!, art: attrs.art, voice: attrs.voice }); return;
    }
    if (command === '@flag') { count(2); this.story.flags.push({ ...src, name: id(a!) }); return; }
    if (command === '@var') { count(3); this.story.variables.push({ ...src, name: id(a!), initial: integer(b!) }); return; }
    if (command === '@location') {
      count(3); quoted(); this.scene = undefined;
      this.location = { ...src, id: id(a!), name: b!, anchors: [] }; this.story.locations.push(this.location); return;
    }
    throw new Error(`해석할 수 없는 최상위 줄: ${text}`);
  }
  private layout(line: Line): void {
    if (!this.location) throw new Error('@layout은 장소 선언 뒤에 와야 합니다');
    if (this.location.layout) throw new Error('장소에 레이아웃을 두 번 선언했습니다');
    const rows: (Source & { text: string })[] = [];
    let closed = false;
    while (this.cursor < this.lines.length) {
      const row = this.lines[this.cursor]!;
      if (row.text === '@end' && row.indent === line.indent) { this.cursor++; closed = true; break; }
      // Recover at a new directive/heading rather than swallowing the rest of the document.
      if (row.text.startsWith('@') || /^#{2,3}\s/.test(row.text)) break;
      this.cursor++; rows.push({ ...this.source(row), text: row.raw.slice(line.indent) });
    }
    if (!closed) this.error(line, '@layout을 닫는 @end가 필요합니다');
    if (!rows.some(row => row.text.length)) this.error(line, '레이아웃이 비었습니다');
    this.location.layout = { ...this.source(line), rows };
  }
  private end(header: Line): void {
    const line = this.peek();
    if (line?.text === '@end' && line.indent === header.indent) { this.cursor++; return; }
    this.error(line ?? header, `${header.text.split(' ')[0]}을 닫는 같은 들여쓰기의 @end가 필요합니다`);
  }
  private body(parentIndent: number): Statement[] {
    const result: Statement[] = []; const first = this.peek();
    if (!first || first.indent <= parentIndent) return result;
    const indent = first.indent;
    for (let line = this.peek(); line && line.indent > parentIndent; line = this.peek()) {
      this.cursor++;
      this.attempt(line, () => {
        if (line.indent !== indent) throw new Error('같은 블록의 들여쓰기 폭이 다릅니다');
        result.push(this.statement(line));
      });
    }
    return result;
  }
  private statement(line: Line): Statement {
    const src = this.source(line);
    if (line.text.startsWith('@if ')) {
      const condition = parseCondition(line.text.slice(4)); const yes = this.body(line.indent);
      let no: Statement[] = []; const next = this.peek();
      if (next?.text === '@else' && next.indent === line.indent) { this.cursor++; no = this.body(line.indent); }
      this.end(line); return { ...src, kind: 'if', condition, then: yes, else: no };
    }
    if (line.text.startsWith('? ')) {
      const opts: Option[] = []; const first = this.peek(); const indent = first?.indent;
      while (true) {
        const next = this.peek();
        if (!next || next.indent <= line.indent) break;
        if (next.indent !== indent || !/^\*>?\s+\S/.test(next.text)) { this.cursor++; this.error(next, '선택지 줄 또는 들여쓰기 오류'); continue; }
        this.cursor++;
        const chosen = next.text.startsWith('*>');
        opts.push({ ...this.source(next), chosen, label: next.text.slice(chosen ? 2 : 1).trim(), statements: this.body(next.indent) });
      }
      if (!opts.length) this.error(line, '선택지가 필요합니다');
      if (opts.filter(option => option.chosen).length > 1) this.error(line, '촬영 선택지 *>는 하나만 지정합니다');
      return { ...src, kind: 'choice', prompt: line.text.slice(2).trim(), options: opts };
    }
    return simple(line.text, src);
  }
  private event(line: Line): Event {
    const match = /^@event\s+(\S+)\s+at\s+(\S+)(?:\s+(.*))?$/.exec(line.text);
    if (!match) throw new Error('이벤트는 @event id at 앵커 형식입니다');
    const opts = tokens(match[3] ?? ''); const once = opts.filter(token => token.value === 'once').length;
    if (once > 1) throw new Error('once 중복');
    const attrs = options(opts.filter(token => token.value !== 'once'), ['trigger', 'character', 'wander']);
    if (attrs.trigger && !['action', 'auto', 'touch'].includes(attrs.trigger)) throw new Error('trigger는 action/auto/touch입니다');
    const node: Event = { ...this.source(line), kind: 'event', id: id(match[1]!), anchor: match[2]!, once: once === 1, trigger: (attrs.trigger ?? 'action') as Event['trigger'], character: attrs.character ? id(attrs.character) : undefined, wander: attrs.wander ? route(attrs.wander) : undefined, pages: [] };
    const first: Page = { ...this.source(line), statements: this.body(line.indent) }; node.pages.push(first);
    while (true) {
      const next = this.peek();
      if (!next || next.indent !== line.indent || !next.text.startsWith('@page ')) break;
      this.cursor++;
      this.attempt(next, () => {
        const condition = /^@page\s+when=(.+)$/.exec(next.text);
        if (!condition) throw new Error('@page when=조건 형식이 필요합니다');
        node.pages.push({ ...this.source(next), condition: parseCondition(condition[1]!), statements: this.body(line.indent) });
      });
    }
    this.end(line); return node;
  }
}

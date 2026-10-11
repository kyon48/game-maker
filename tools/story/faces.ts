import type { Story, Statement, Diagnostic, Source } from './ast';
import { normalizeExpression } from './expressions';
export interface Face { portrait: string; expression: string }
export class StoryArtError extends Error {
  constructor(source: Source, message: string, code = 'S038') { super(message); this.diagnostic = { file: source.file, line: source.line, message, code, level: 'error' }; }
  readonly diagnostic: Diagnostic;
}
/** Branches inherit entry values without leaking state across siblings or past the join. */
export function storyFaces(stories: readonly Story[], aliases: ReadonlyMap<string, string>): ReadonlyMap<Statement, Face> {
  const names = new Map(stories.flatMap(s => s.characters).map(c => [c.name, c]));
  const faces = new Map<Statement, Face>();
  const walk = (nodes: readonly Statement[], previous: Map<string, string>) => {
    for (const node of nodes) {
      if (node.kind === 'dialogue') {
        const character = node.speaker && names.get(node.speaker);
        if (!character || !character.art) continue;
        let key = previous.get(character.id) ?? 'neutral';
        if (node.expression) {
          try { key = normalizeExpression(node.expression, aliases); }
          catch (error) { throw new StoryArtError(node, String(error), 'S007'); }
        }
        previous.set(character.id, key); faces.set(node, { portrait: character.id, expression: key });
      } else if (node.kind === 'if') { walk(node.then, new Map(previous)); walk(node.else, new Map(previous)); }
      else if (node.kind === 'choice') for (const option of node.options) walk(option.statements, new Map(previous));
    }
  };
  for (const story of stories) {
    for (const common of story.common) walk(common.statements, new Map());
    for (const scene of story.scenes) for (const event of scene.items) if (event.kind === 'event') for (const page of event.pages) walk(page.statements, new Map());
  }
  return faces;
}
export function portraitOutputs(faces: ReadonlyMap<Statement, Face>): Map<string, string> {
  const entries = [...new Set([...faces.values()].map(face => `${face.portrait}/${face.expression}`))].sort();
  const portraits: Record<string, Record<string, string>> = Object.create(null) as Record<string, Record<string, string>>;
  for (const entry of entries) { const [id, key] = entry.split('/') as [string, string]; (portraits[id] ??= Object.create(null) as Record<string, string>)[key] = `assets/portraits/${entry}.png`; }
  return new Map([['portraits.json', JSON.stringify(portraits, null, 2) + '\n']]);
}

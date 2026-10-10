import type { Story, Statement } from './ast';
/** Structural traversal IDs: no timestamps, absolute paths, or narration text in pack commands. */
export function storyCues(stories: readonly Story[]): ReadonlyMap<Statement, string> {
  const cues = new Map<Statement, string>();
  const walk = (nodes: readonly Statement[]) => {
    for (const node of nodes) {
      if (node.kind === 'narration' || node.kind === 'waitNarration') cues.set(node, `story_cue_${cues.size + 1}`);
      if (node.kind === 'if') { walk(node.then); walk(node.else); }
      if (node.kind === 'choice') for (const option of node.options) walk(option.statements);
    }
  };
  for (const story of stories) {
    for (const common of story.common) walk(common.statements);
    for (const scene of story.scenes) for (const item of scene.items) if (item.kind === 'event') for (const page of item.pages) walk(page.statements);
  }
  return cues;
}

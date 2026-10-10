import type { Story, Statement, Event } from './ast';
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

export interface SceneNarrationCue { id: string; narrations: readonly Extract<Statement, { kind: 'narration' }>[] }
/** Hold an auto before even its once flag changes; the last preceding narrator releases the group. */
export function sceneNarrationCues(stories: readonly Story[]): ReadonlyMap<Event, SceneNarrationCue> {
  const cues = new Map<Event, SceneNarrationCue>();
  for (const story of stories) for (const scene of story.scenes) {
    let narrations: Extract<Statement, { kind: 'narration' }>[] = [];
    for (const item of scene.items) {
      if (item.kind === 'narration') narrations.push(item);
      if (item.kind !== 'event' || item.film === 'skip') continue;
      if (item.trigger === 'auto' && narrations.length) cues.set(item, { id: `story_scene_cue_${cues.size + 1}`, narrations });
      narrations = [];
    }
  }
  return cues;
}

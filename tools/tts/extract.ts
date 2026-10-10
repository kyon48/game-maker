import type { Command } from '../../engine/data/events';
import type { ValidatedPack } from '../../engine/data/validator/types';
import { plainText, parseText } from '../../engine/data/text';
import type { Film } from '../../engine/data/schema/film';
import type { PluginRuntime } from '../../engine/sim/plugins/PluginRuntime';
import { rehearse } from '../film/rehearse';
export function collectTexts(pack: ValidatedPack): { text: string; speaker?: string }[] {
  const found: { text: string; speaker?: string }[] = [];
  const walk = (commands: readonly Command[]) => {
    for (const command of commands) {
      if (command.cmd === 'text') found.push({ text: command.text as string, speaker: command.speaker as string | undefined });
      if (command.cmd === 'if') { walk(command.then as Command[]); walk((command.else ?? []) as Command[]); }
      if (command.cmd === 'choice') for (const option of command.options as { commands: Command[] }[]) walk(option.commands);
    }
  };
  for (const events of pack.events.values()) for (const event of events) for (const page of event.pages) walk(page.commands ?? []);
  for (const common of Object.values(pack.common)) walk(common.commands);
  return found;
}
export function staticUtterances(pack: ValidatedPack) {
  return collectTexts(pack).filter(m => ![m.text, m.speaker ?? ''].some(text => parseText(text).some(t => t.kind === 'var' || t.kind === 'plugin'))).map(m => ({ plainText: plainText(m.text, { variable: () => '', plugin: () => '' }), speaker: m.speaker }));
}
export async function extractFilm(pack: ValidatedPack, film: Film, plugins: PluginRuntime, warn: (text: string) => void = console.warn) {
  const extraction: Film = { ...film, steps: film.steps.map(s => 'advanceText' in s && s.advanceText === 'voice' ? { advanceText: 'auto' } : s) };
  const result = await rehearse(pack, extraction, plugins, true), sources = new Set(collectTexts(pack).map(m => m.text));
  return result.events.flatMap(e => { if (e.type === 'text-start' || e.type === 'narration-start') return [e]; return []; }).map(e => {
    if (e.type === 'narration-start') return { plainText: e.plainText, speaker: 'narrator' };
    if (e.textOrigin === 'plugin' || (e.textOrigin === undefined && !sources.has(e.sourceText ?? e.text))) warn(`Plugin ctx.showText utterance captured: ${e.plainText}`);
    return { plainText: e.plainText, speaker: e.speaker };
  });
}

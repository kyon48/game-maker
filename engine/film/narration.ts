import type { PluginRuntime } from '../sim/plugins/PluginRuntime';
import type { Game } from '../sim/Game';
import type { Voices } from '../data/schema/voices';
import { plainText } from '../data/text';
import { voiceKey } from '../data/voice';
import type { FilmAudioOptions } from './audio';
export function narrationOptions(game: () => Game, voices: Voices | undefined, lengths: Readonly<Record<string, number>>, extraction = false, plugins?: PluginRuntime): FilmAudioOptions {
  return { narration(text) {
    const current = game();
    const resolved = plainText(text, {
      variable: name => String(current.state.getVar(name)),
      plugin: name => {
        if (!plugins) throw new Error(`Unknown plugin text function: ${name}`);
        return plugins.format(name, {}, current.state);
      },
    });
    const voice = voices?.narrator;
    if (!voice) throw new Error('Missing narrator voice; configure voices.json and run npm run tts first');
    const key = voiceKey(voice, resolved), frames = lengths[key] ?? (extraction ? Math.ceil(30 * (0.6 + [...resolved].length * 0.07)) : undefined);
    if (frames === undefined) throw new Error(`Missing narration voice length ${key}; run npm run tts first`);
    return { plainText: resolved, voiceKey: key, voiceFrames: frames };
  } };
}

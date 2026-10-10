import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Voices, VoiceManifest } from '../../engine/data/schema/voices';
import { voiceKey } from '../../engine/data/voice';
import type { TtsProvider } from './provider';
import { wavFrames } from './provider';
export interface Utterance { plainText: string; speaker?: string }
export async function cacheVoices(pack: string, utterances: readonly Utterance[], voices: Voices, providerMap: ReadonlyMap<string, TtsProvider>, options: { root?: string; prune?: boolean; warn?: (text: string) => void } = {}) {
  const root = options.root ?? process.cwd(), directory = path.join(root, '.cache/voice', pack), manifestFile = path.join(root, 'packs', pack, 'voice-manifest.json');
  let manifest: VoiceManifest = {};
  try { manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as VoiceManifest; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  await mkdir(directory, { recursive: true });
  const used = new Set<string>(); let generated = 0;
  for (const message of utterances) {
    const voice = voices[message.speaker ?? 'narrator'];
    if (!voice) { options.warn?.(`Missing voice: ${message.speaker ?? 'narrator'}`); continue; }
    const key = voiceKey(voice, message.plainText);
    if (used.has(key)) continue; used.add(key);
    const file = path.join(directory, key + '.wav');
    let wav: Buffer | undefined;
    try { wav = await readFile(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (wav && message.plainText.trim() && wavFrames(wav) === 0) throw new Error(`Empty voice cache: ${key}`);
    if (!wav) {
      const provider = providerMap.get(voice.provider); if (!provider) throw new Error(`Unknown provider: ${voice.provider}`);
      wav = (await provider.synthesize(message.plainText, voice.voice, voice.speed ?? 1)).wav;
      const frames = wavFrames(wav);
      if (message.plainText.trim() && frames === 0) throw new Error('TTS provider returned empty audio');
      if (manifest[key] && manifest[key]!.frames !== frames) options.warn?.(`Regenerated voice length changed: ${key} (${manifest[key]!.frames} → ${frames}); manifest length retained`);
      await writeFile(file, wav); generated++;
    }
    manifest[key] ??= { frames: wavFrames(wav), provider: voice.provider, voice: voice.voice };
  }
  if (options.prune) manifest = Object.fromEntries(Object.entries(manifest).filter(([key]) => used.has(key)));
  manifest = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b, 'en')));
  const bytes = JSON.stringify(manifest, null, 2) + '\n';
  let previous: string | undefined; try { previous = await readFile(manifestFile, 'utf8'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (previous !== bytes) await writeFile(manifestFile, bytes);
  return { manifest, generated };
}

import { prepareFilm } from './film/rehearse';
import { extractFilm } from './tts/extract';
import { cacheVoices } from './tts/cache';
import { providers } from './tts/provider';
try {
  const [pack, ...args] = process.argv.slice(2); let name = 'main', prune = false;
  if (!pack || !/^[a-z][a-z0-9_]*$/.test(pack)) throw new Error('Usage: npm run tts -- <pack> [--film main] [--prune]');
  for (let i = 0; i < args.length; i++) { if (args[i] === '--film' && args[i + 1]) name = args[++i]!; else if (args[i] === '--prune') prune = true; else throw new Error(`Unknown option: ${args[i]}`); }
  const { pack: data, film, plugins } = await prepareFilm(pack, name);
  if (!data.voices) throw new Error('voices.json is required for TTS');
  const utterances = await extractFilm(data, film, plugins);
  const result = await cacheVoices(pack, utterances, data.voices, providers, { prune, warn: console.warn });
  console.log(`${pack}/${name}: ${utterances.length} utterances; generated ${result.generated} cached voices`);
} catch (error) { console.error(String(error)); process.exitCode = 1; }

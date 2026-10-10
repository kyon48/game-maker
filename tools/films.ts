import { parseManifest } from './story/ownership';
import { assertNoStoryVoiceOverlap } from './story/rehearsal';
import { packIds } from './packs';
import { FsSource } from './fsSource';
import { filmFiles, prepareFilm, rehearse } from './film/rehearse';
try {
  for (const id of await packIds()) for (const file of await filmFiles(new FsSource(`packs/${id}`))) {
    const name = file.slice(6, -10), { pack, film, plugins } = await prepareFilm(id, name);
    const source = new FsSource(`packs/${id}`);
    const owned = await source.exists('story/.compiled.json') && Object.hasOwn(parseManifest(JSON.stringify(await source.readJson('story/.compiled.json'))).files, file);
    const result = await rehearse(pack, film, plugins).then(result => {
      if (owned) assertNoStoryVoiceOverlap(result.warnings);
      return result;
    }).catch(error => {
      throw new Error(`${String(error)}\n매니페스트를 갱신하려면 npm run story -- build ${id} 를 실행하세요`);
    });
    for (const warning of result.warnings) console.warn(`${id}/${file}: ${warning}`);
    console.log(`${id}/${file}: passed (${result.ticks} ticks)`);
  }
} catch (error) { console.error(String(error)); process.exitCode = 1; }

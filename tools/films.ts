import { packIds } from './packs';
import { FsSource } from './fsSource';
import { filmFiles, prepareFilm, rehearse } from './film/rehearse';
try {
  for (const id of await packIds()) for (const file of await filmFiles(new FsSource(`packs/${id}`))) {
    const name = file.slice(6, -10), { pack, film, plugins } = await prepareFilm(id, name);
    const result = await rehearse(pack, film, plugins);
    console.log(`${id}/${file}: passed (${result.ticks} ticks)`);
  }
} catch (error) { console.error(String(error)); process.exitCode = 1; }

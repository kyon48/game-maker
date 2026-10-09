import { FsSource } from '../fsSource';
import type { PackSource } from '../../engine/api';
import { parseManifest, storyGeneratedPath } from './ownership';
/** Pre-generation validation excludes only outputs explicitly owned by the story compiler. */
export async function storySource(folder: string, files: ReadonlyMap<string, string> = new Map(), excludeGenerated = false): Promise<PackSource> {
  const fs = new FsSource(folder);
  const excluded = new Set<string>();
  if (excludeGenerated) {
    const text = files.get('story/.compiled.json');
    const manifest = text !== undefined ? parseManifest(text) : await fs.exists('story/.compiled.json') ? parseManifest(JSON.stringify(await fs.readJson('story/.compiled.json'))) : undefined;
    for (const file of Object.keys(manifest?.files ?? {})) if (storyGeneratedPath.test(file)) excluded.add(file);
  }
  return {
    readJson: async file => files.has(file) ? JSON.parse(files.get(file)!) as unknown : fs.readJson(file),
    exists: async file => files.has(file) || await fs.exists(file),
    listFiles: async () => [...new Set([...(await fs.listFiles()), ...files.keys()])].filter(file => !excluded.has(file)),
  };
}

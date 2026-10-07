import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
export async function syncSchemaFiles(directory: string, schemas: ReadonlyMap<string, unknown>, check: boolean): Promise<string[]> {
  if (!check) {
    await mkdir(directory, { recursive: true });
    for (const [name, schema] of schemas) await writeFile(path.join(directory, name), JSON.stringify(schema, null, 2) + '\n');
    return [];
  }
  const diagnostics: string[] = [];
  for (const [name, schema] of schemas) {
    try {
      const actual = await readFile(path.join(directory, name), 'utf8');
      if (actual !== JSON.stringify(schema, null, 2) + '\n') diagnostics.push(`Outdated schema: ${name}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      diagnostics.push(`Missing schema: ${name}`);
    }
  }
  let files: string[];
  try { files = await readdir(directory); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; files = []; }
  for (const name of files.sort()) if (name.endsWith('.schema.json') && !schemas.has(name)) diagnostics.push(`Unexpected schema: ${name}`);
  return diagnostics;
}

import { mkdir, writeFile } from 'node:fs/promises';
import { packSchemas } from '../engine/data/schema/export';
import { builtinCatalog } from './catalog';
await mkdir('schemas', { recursive: true });
for (const [name, schema] of packSchemas(builtinCatalog())) await writeFile(`schemas/${name}`, JSON.stringify(schema, null, 2) + '\n');

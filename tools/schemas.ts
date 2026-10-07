import { packSchemas } from '../engine/data/schema/export';
import { builtinCatalog } from './catalog';
import { syncSchemaFiles } from './schemaFiles';
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => arg !== '--check')) throw new Error('Usage: schemas [--check]');
const diagnostics = await syncSchemaFiles('schemas', packSchemas(builtinCatalog()), args.includes('--check'));
for (const diagnostic of diagnostics) console.error(diagnostic);
if (diagnostics.length) { console.error('npm run schemas 를 실행해 다시 생성하세요'); process.exitCode = 1; }

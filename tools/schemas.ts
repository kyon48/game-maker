import { packSchemas } from '../engine/data/schema/export';
import { builtinCatalog } from './catalog';
import { syncSchemaFiles } from './schemaFiles';
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => arg !== '--check')) throw new Error('Usage: schemas [--check]');
const diagnostics = await syncSchemaFiles('schemas', packSchemas(builtinCatalog()), args.includes('--check'));
for (const diagnostic of diagnostics) console.error(diagnostic);
if (diagnostics.length) process.exitCode = 1;

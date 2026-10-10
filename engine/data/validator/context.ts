import type { TSchema } from '@sinclair/typebox';
import type { PackSource } from '@engine/api';
import { schemaErrors } from './schemaErrors';
import { CommandSchema, ConditionSchema } from '../schema/events';
import type { Diagnostic, ValidationOptions } from './types';
import type { Characters } from '../characters';
export const escapePointer = (key: string) => key.replace(/~/g, '~0').replace(/\//g, '~1');
export function validationContext(source: PackSource, id: string, options: ValidationOptions) {
  const diagnostics: Diagnostic[] = [];
  const report = (code: string, file: string, pointer: string, message: string) => diagnostics.push({ code, file, pointer, message, level: code === 'V10' || code === 'V11' || code === 'VOICE' ? 'warning' : 'error' });
  const references = [ConditionSchema, CommandSchema];
  const jsonCache = new Map<string, Promise<unknown>>();
  const readJson = (file: string): Promise<unknown> => {
    let pending = jsonCache.get(file);
    if (!pending) { pending = source.readJson(file); jsonCache.set(file, pending); }
    return pending;
  };
  const check = (schema: TSchema, value: unknown, file: string, pointer = '') => {
    const errors = schemaErrors(schema, references, value);
    for (const error of errors) {
      report('V1', file, pointer + error.path, error.message);
      if (/\/wander\/\d+$/.test(error.path)) report('V9', file, pointer + error.path, 'Invalid wander token');
    }
    return errors.length === 0;
  };
  const read = async (file: string, schema: TSchema): Promise<unknown> => {
    try { const value = await readJson(file); return check(schema, value, file) ? value : undefined; }
    catch (error) { report('V1', file, '', `Cannot read JSON: ${String(error)}`); return undefined; }
  };
  return { source, id, options, diagnostics, report, references, readJson, check, read };
}
export type ValidationContext = ReturnType<typeof validationContext>;
export function createUsage(characters: Characters, report: ValidationContext['report']) {
  const usedCharacters = new Set<string>(), usedCommon = new Set<string>(), usedFlags = new Set<string>(), usedVars = new Set<string>();
  const characterReference = (name: string, file: string, pointer: string) => {
    usedCharacters.add(name); if (!Object.hasOwn(characters, name)) report('V3', file, pointer, `Unknown character: ${name}`);
  };
  return { usedCharacters, usedCommon, usedFlags, usedVars, characterReference };
}
export type Usage = ReturnType<typeof createUsage>;

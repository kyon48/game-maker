import { Value } from '@sinclair/typebox/value';
import type { ValueError } from '@sinclair/typebox/errors';
import type { TSchema } from '@sinclair/typebox';
/** Show the closest failed union branch so errors retain actionable JSON pointers. */
export function schemaErrors(schema: TSchema, references: TSchema[], value: unknown): ValueError[] {
  const flatten = (error: ValueError): ValueError[] => {
    if (!error.errors.length) return [error];
    const alternatives = error.errors.map(iterator => [...iterator].flatMap(flatten));
    const minimum = Math.min(...alternatives.map(branch => branch.length));
    return alternatives.filter(branch => branch.length === minimum).flat();
  };
  return [...Value.Errors(schema, references, value)].flatMap(flatten);
}

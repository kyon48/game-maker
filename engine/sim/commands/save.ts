import { Type } from '@sinclair/typebox';
// Pack schema only in M5; runtime handler is implemented in M6.
export const argsSchema = Type.Object({}, { additionalProperties: false });

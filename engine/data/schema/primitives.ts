import { Type } from '@sinclair/typebox';
export const ID_PATTERN = '^[a-z][a-z0-9_]*$';
export const Id = Type.String({ pattern: ID_PATTERN });
export const SafeInteger = Type.Integer({ minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER });
export const Positive = Type.Integer({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER });
export const Nonnegative = Type.Integer({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER });
export const DirSchema = Type.Union([Type.Literal('up'), Type.Literal('down'), Type.Literal('left'), Type.Literal('right')]);
export const Text = Type.String({ minLength: 1, pattern: '^[^\\u0000-\\u0009\\u000b-\\u001f\\u007f]*$' });
export const objectOptions = { additionalProperties: false } as const;

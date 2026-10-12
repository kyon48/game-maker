import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Id, objectOptions } from './schema/primitives';
const number = Type.Integer({ minimum: 0, maximum: 1000000 });
const unit = { name: Type.String({ minLength: 1 }), hp: Type.Integer({ minimum: 1, maximum: 1000000 }), atk: number, def: number, speed: number, skills: Type.Array(Id, { minItems: 1, maxItems: 6, uniqueItems: true }), image: Type.Optional(Type.String()) };
export const BattleArgs = Type.Object({ troop: Id }, objectOptions);
export const BattleSchema = Type.Object({
  labels: Type.Object({ hp: Type.String(), attack: Type.String(), defend: Type.String(), escape: Type.Optional(Type.String()), victory: Type.Optional(Type.String()), defeat: Type.Optional(Type.String()), gameOver: Type.Optional(Type.String()), target: Type.Optional(Type.String()) }, objectOptions),
  variation: Type.Optional(Type.Boolean()),
  actors: Type.Record(Id, Type.Object(unit, objectOptions), objectOptions),
  enemies: Type.Record(Id, Type.Object({ ...unit, weights: Type.Optional(Type.Record(Id, Type.Number({ exclusiveMinimum: 0, maximum: 1000000 }), objectOptions)), script: Type.Optional(Type.Record(Type.String({ pattern: '^[1-9][0-9]*$' }), Id, objectOptions)) }, objectOptions), objectOptions),
  skills: Type.Record(Id, Type.Object({ name: Type.String({ minLength: 1 }), effect: Type.Union([Type.Literal('damage'), Type.Literal('heal'), Type.Literal('buff')]), power: Type.Optional(number), text: Type.String(), stat: Type.Optional(Type.Union([Type.Literal('atk'), Type.Literal('def'), Type.Literal('speed')])), multiplier: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 10 })), turns: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })), sfx: Type.Optional(Id) }, objectOptions), objectOptions),
  troops: Type.Record(Id, Type.Object({ actors: Type.Optional(Type.Array(Id, { minItems: 1, maxItems: 3, uniqueItems: true })), enemies: Type.Array(Id, { minItems: 1, maxItems: 3 }), background: Type.Optional(Type.String()), image: Type.Optional(Type.String()), canLose: Type.Boolean(), canEscape: Type.Optional(Type.Boolean()), variation: Type.Optional(Type.Boolean()) }, objectOptions), objectOptions),
}, objectOptions);
export type Battle = Static<typeof BattleSchema>;
/** Insert battle placeholders as escaped literals, then let the ordinary G1 resolver handle controls/state. */
export function battleText(text: string, values: { user: string; target: string; value: number }): string {
  return text.replace(/\{\{|\}\}|\{(user|target|value)\}/g, (token, key: keyof typeof values | undefined) => key ? String(values[key]).replace(/[{}]/g, c => c + c) : token);
}

import type { Static } from '@sinclair/typebox';
import type { ConditionSchema } from './schema/events';
export type Condition = Static<typeof ConditionSchema>;
export type { Command } from './schema/events';

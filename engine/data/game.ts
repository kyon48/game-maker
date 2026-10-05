import type { Static } from '@sinclair/typebox';
import type { GameSchema, InitialStateSchema } from './schema/game';
import type { PageSchema, EventSchema } from './schema/events';
export type GameConfig = Static<typeof GameSchema>;
export type InitialState = Static<typeof InitialStateSchema>;
export type EventPage = Static<typeof PageSchema>;
export type EventDefinition = Static<typeof EventSchema>;

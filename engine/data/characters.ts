import type { Static } from '@sinclair/typebox';
import type { CharacterSchema, CharactersSchema } from './schema/characters';
export type CharacterDefinition = Readonly<Static<typeof CharacterSchema>>;
export type Characters = Readonly<Static<typeof CharactersSchema>>;

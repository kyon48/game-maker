import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Id, objectOptions } from './schema/primitives';
export const audioFilePattern = /\.(ogg|wav|mp3|flac|m4a)$/i;
export const AudioSchema = Type.Record(Id, Type.Object({ file: Type.String({ minLength: 1 }), volume: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })), loop: Type.Optional(Type.Boolean()) }, objectOptions), objectOptions);
export type Audio = Static<typeof AudioSchema>;
export type SoundRequest = { kind: 'bgm'; id: string | null; fade: number } | { kind: 'sfx'; id: string };
export interface SoundSnapshot { bgm: string | null; requests: readonly SoundRequest[] }

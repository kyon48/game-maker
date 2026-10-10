import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import { Nonnegative, objectOptions } from './primitives';
export const VoiceSchema = Type.Object({ provider: Type.String({ minLength: 1 }), voice: Type.String({ minLength: 1 }), speed: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 10 })) }, objectOptions);
export const VoicesSchema = Type.Record(Type.String({ minLength: 1 }), VoiceSchema);
export const VoiceManifestSchema = Type.Record(Type.String({ pattern: '^[a-f0-9]{64}$' }), Type.Object({ frames: Nonnegative, provider: Type.String({ minLength: 1 }), voice: Type.String({ minLength: 1 }) }, objectOptions));
export type Voices = Static<typeof VoicesSchema>;
export type Voice = Static<typeof VoiceSchema>;
export type VoiceManifest = Static<typeof VoiceManifestSchema>;

import type { Static } from '@sinclair/typebox';
import type { SkinSchema } from './schema/skin';
export type Skin = Static<typeof SkinSchema>;

import { Type } from '@sinclair/typebox';
export const RouteTokenSchema = Type.String({ pattern: '^(up|down|left|right|face:(up|down|left|right)|wait:[1-9][0-9]*)$' });
export const RouteSchema = Type.Array(RouteTokenSchema);

import { VoicesSchema, VoiceManifestSchema } from './voices';
import type { CommandCatalog } from '../validator/types';
import { GameSchema } from './game';
import { CharactersSchema } from './characters';
import { SkinSchema } from './skin';
import { EventsSchema, CommonEventsSchema, ConditionSchema } from './events';
import { FilmSchema } from './film';
import { ScenarioSchema } from './scenario';
import { TiledSchema, TilesetSchema } from './tiled';
/** JSON output uses precisely the registered args, including nested command references. */
export function packSchemas(catalog: CommandCatalog): ReadonlyMap<string, unknown> {
  const command = { anyOf: [...catalog].map(([name, definition]) => ({ ...definition.args, properties: { ...definition.args.properties, cmd: { const: name, type: 'string' } }, required: [...(definition.args.required ?? []), 'cmd'] })) };
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '$id').map(([key, child]) => [key, key === '$ref' ? `#/$defs/${child}` : normalize(child)]));
    return value;
  };
  const definitions = { Command: normalize(command), Condition: normalize(ConditionSchema) };
  return new Map(Object.entries({ game: GameSchema, characters: CharactersSchema, skin: SkinSchema, events: EventsSchema, 'common-events': CommonEventsSchema, tiled: TiledSchema, tileset: TilesetSchema, scenario: ScenarioSchema, film: FilmSchema, voices: VoicesSchema, 'voice-manifest': VoiceManifestSchema })
    .map(([name, schema]) => [`${name}.schema.json`, { $schema: 'https://json-schema.org/draft/2020-12/schema', ...normalize(schema) as object, ...(['events', 'common-events', 'scenario', 'film'].includes(name) ? { $defs: definitions } : {}) }]));
}

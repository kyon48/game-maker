import { Character } from './Character';
import type { EventDefinition } from '../../data/game';
import type { Characters } from '../../data/characters';
export class EventObject extends Character {
  constructor(definition: EventDefinition, tileSize: number, characters: Characters) {
    if (definition.pages.some(page => page.when !== undefined)) throw new Error(`Conditional pages require M3: ${definition.id}`);
    const page = definition.pages[definition.pages.length - 1];
    if (!page) throw new Error(`Missing event page: ${definition.id}`);
    const graphic = page.character === undefined ? undefined : characters[page.character];
    if (page.character !== undefined && !graphic) throw new Error(`Unknown character: ${page.character}`);
    super(definition.id, definition.x, definition.y, page.dir ?? 'down', tileSize, graphic);
    this.through = page.through ?? false;
  }
}

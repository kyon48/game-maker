import { Character } from './Character';
import type { EventDefinition, EventPage } from '../../data/game';
import type { Characters } from '../../data/characters';
import type { GameState } from '../state/GameState';
import { evaluate } from '../event/conditions';
export class EventObject extends Character {
  private selected = -2;
  constructor(private readonly definition: EventDefinition, tileSize: number,
    private readonly characters: Characters, state: GameState, readonly mapId: string) {
    super(definition.id, definition.x, definition.y, 'down', tileSize);
    this.refresh(state);
  }
  get pageIndex(): number { return this.selected; }
  get page(): EventPage | undefined { return this.definition.pages[this.selected]; }
  refresh(state: GameState): void {
    let selected = -1;
    for (let i = this.definition.pages.length - 1; i >= 0; i--) {
      const page = this.definition.pages[i]!;
      if (page.when === undefined || evaluate(page.when, state, { mapId: this.mapId, id: this.id })) { selected = i; break; }
    }
    if (selected === this.selected) return;
    this.selected = selected;
    const page = this.page;
    const graphic = page?.character === undefined ? undefined : this.characters[page.character];
    if (!page) this.cancelRoute();
    this.active = page !== undefined; this.through = page?.through ?? false;
    this.dir = page?.dir ?? 'down'; this.setGraphic(graphic);
  }
}

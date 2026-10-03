import type { Player } from '../entity/Player';
import type { EventObject } from '../entity/EventObject';
export class TriggerSlot {
  private pending: EventObject | undefined;
  enqueue(event: EventObject): void { this.pending ??= event; }
  take(): EventObject | undefined { const event = this.pending; this.pending = undefined; return event; }
}
export function actionTarget(player: Player, events: readonly EventObject[]): EventObject | undefined {
  const target = player.target(player.dir);
  const actionable = (event: EventObject) => event.active && event.page?.trigger === 'action';
  return events.find(event => actionable(event) && event.x === target.x && event.y === target.y)
    ?? events.find(event => actionable(event) && event.through && event.x === player.x && event.y === player.y);
}

import type { MapState } from '../world/MapState';
import type { CharacterDefinition } from '../../data/characters';
export type Dir = 'up' | 'down' | 'left' | 'right';
export const directions: readonly Dir[] = ['up', 'down', 'left', 'right'];
const delta: Readonly<Record<Dir, { x: number; y: number }>> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};
interface Route { tokens: readonly string[]; index: number; wait: number; done: boolean }
interface Movement { readonly x: number; readonly y: number; elapsed: number; readonly duration: number }
export interface CharacterSnapshot {
  readonly id: string; readonly graphic: CharacterDefinition | undefined;
  readonly pixelX: number; readonly pixelY: number; readonly dir: Dir; readonly frame: number;
  readonly active: boolean; readonly visible: boolean;
}
export class Character {
  private route: Route | undefined;
  private wander: Route | undefined;
  protected setWander(tokens?: readonly string[]): void { this.wander = tokens?.length ? { tokens: [...tokens], index: 0, wait: 0, done: false } : undefined; }
  advanceWander(map: MapState, paused: boolean): void {
    if (paused || this.routed || !this.wander || !this.active || this.moving) { if (paused) this.stand(); return; }
    if (this.wander.done) { this.wander.index = 0; this.wander.wait = 0; this.wander.done = false; }
    this.advancePath(this.wander, map);
  }
  get routed(): boolean { return this.route !== undefined && !this.route.done; }
  setRoute(tokens: readonly string[]): { done: boolean } {
    if (this.route) this.route.done = true;
    if (!this.active) return { done: true };
    this.route = { tokens: [...tokens], index: 0, wait: 0, done: false }; return this.route;
  }
  cancelRoute(): void { if (this.route) this.route.done = true; this.route = undefined; }
  place(x: number, y: number, dir = this.dir): void {
    this.tileX = x; this.tileY = y; this.dir = dir; this.movement = undefined; this.walkingTicks = 0;
    if (this.route) this.route.done = true;
    this.route = undefined;
  }
  advanceRoute(map: MapState): void {
    if (this.route) this.advancePath(this.route, map);
  }
  private advancePath(route: Route, map: MapState): void {
    if (!route || route.done || this.moving || !this.active) return;
    if (route.wait > 0 && --route.wait > 0) return;
    while (route.index < route.tokens.length) {
      const token = route.tokens[route.index++]!;
      if (directions.includes(token as Dir)) {
        if (map.tryMove(this, token as Dir)) return;
      } else if (token.startsWith('face:')) this.dir = token.slice(5) as Dir;
      else { route.wait = Number(token.slice(5)); return; }
    }
    route.done = true; this.stand();
  }
  private movement: Movement | undefined;
  private walkingTicks = 0;
  private tileX: number;
  private tileY: number;
  dir: Dir;
  active = true;
  visible = true;
  through = false;
  private timing = 16;
  private appearance: CharacterDefinition | undefined;
  get moveTicks(): number { return this.timing; }
  get graphic(): CharacterDefinition | undefined { return this.appearance; }
  constructor(readonly id: string, x: number, y: number, dir: Dir,
    readonly tileSize: number, graphic?: CharacterDefinition) {
    this.tileX = x; this.tileY = y; this.dir = dir;
    this.setGraphic(graphic);
  }
  protected setGraphic(graphic: CharacterDefinition | undefined): void {
    this.timing = graphic?.moveTicks ?? 16;
    if (graphic && 'sheet' in graphic && graphic.sheet !== undefined) {
      const frameTicks = graphic.frameTicks ?? 8, walkFrames = graphic.walkFrames ?? [0, 1, 0, 2];
      const rows = graphic.rows ?? { down: 0, left: 1, right: 2, up: 3 };
      this.appearance = { ...graphic, frameTicks, walkFrames: [...walkFrames], rows: { ...rows } };
    } else this.appearance = graphic && { ...graphic };
    this.walkingTicks = 0;
  }
  get x(): number { return this.tileX; }
  get y(): number { return this.tileY; }
  get moving(): boolean { return this.movement !== undefined; }
  get destination(): Readonly<{ x: number; y: number }> | undefined { return this.movement; }
  get pixelX(): number {
    return (this.x + (this.movement ? (this.movement.x - this.x) * this.movement.elapsed / this.movement.duration : 0)) * this.tileSize;
  }
  get pixelY(): number {
    return (this.y + (this.movement ? (this.movement.y - this.y) * this.movement.elapsed / this.movement.duration : 0)) * this.tileSize;
  }
  target(dir: Dir): { x: number; y: number } { return { x: this.x + delta[dir].x, y: this.y + delta[dir].y }; }
  beginMove(x: number, y: number): void {
    if (this.moving || !Number.isInteger(x) || !Number.isInteger(y) || Math.abs(x - this.x) + Math.abs(y - this.y) !== 1) throw new Error(`Invalid movement: ${this.id}`);
    this.movement = { x, y, elapsed: 0, duration: this.moveTicks };
  }
  stand(): void { if (!this.moving) this.walkingTicks = 0; }
  advance(): boolean {
    if (!this.movement) return false;
    this.movement.elapsed++; this.walkingTicks++;
    if (this.movement.elapsed < this.movement.duration) return false;
    this.tileX = this.movement.x; this.tileY = this.movement.y; this.movement = undefined;
    return true;
  }
  snapshot(): CharacterSnapshot {
    const graphic = this.graphic;
    const frame = graphic && 'sheet' in graphic && graphic.sheet !== undefined
      ? graphic.walkFrames![this.moving ? Math.floor(this.walkingTicks / graphic.frameTicks!) % graphic.walkFrames!.length : 0]!
      : 0;
    return { id: this.id, graphic, pixelX: this.pixelX, pixelY: this.pixelY, dir: this.dir,
      frame, active: this.active, visible: this.visible };
  }
}

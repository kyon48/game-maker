import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GameState } from '../engine/sim/state/GameState';
import { Character } from '../engine/sim/entity/Character';
import { Player } from '../engine/sim/entity/Player';
import { MapState } from '../engine/sim/world/MapState';
import { Game } from '../engine/sim/Game';
import { loadTiled } from '../engine/data/loader/tiled';
import { drawCharacters } from '../engine/platform/renderer/characters';
import type { TileMapData } from '../engine/data/loader/tiled';
import type { Action, InputFrame } from '../engine/sim/ports';
import type { CharacterDefinition } from '../engine/data/characters';

function mapData(blocked: number[] = []): TileMapData {
  const data = new Array<number>(25).fill(0);
  for (const index of blocked) data[index] = 1;
  return { width: 5, height: 5, tilewidth: 16, tileheight: 16, tilesets: [], tileLookup: new Map(),
    layers: [{ type: 'tilelayer', name: 'collision', width: 5, height: 5, data, visible: false }] };
}
const placeholder: CharacterDefinition = { placeholder: '#123456', moveTicks: 4 };
const actor = (id: string, x: number, y: number) => new Character(id, x, y, 'down', 16, placeholder);
const input = (...actions: Action[]): InputFrame => ({ held: new Set(actions), pressed: new Set() });
function ticks(world: MapState, count: number): void { for (let i = 0; i < count; i++) world.advance(); }

describe('M2 movement and collision', () => {
  it('blocks collision tiles and all map edges but still faces the attempted direction', () => {
    const player = actor('p', 0, 0), world = new MapState('map', mapData([1, 5]), [player]);
    for (const dir of ['up', 'left', 'right', 'down'] as const) {
      expect(world.tryMove(player, dir)).toBe(false); expect(player.dir).toBe(dir);
    }
    expect(player.moving).toBe(false);
    expect(world.collision.passable(5, 0)).toBe(false); expect(world.collision.passable(0, 5)).toBe(false);
    expect(world.collision.passable(1.5, 1)).toBe(false);
  });
  it('allows maps without collision layer and ignores flags on empty collision GIDs', () => {
    const data = mapData(); data.layers = [];
    expect(new MapState('map', data, []).collision.passable(4, 4)).toBe(true);
    const flagged = mapData(); const layer = flagged.layers[0]!;
    if (layer.type === 'tilelayer') layer.data[1] = 0x10000000;
    expect(new MapState('map', flagged, []).collision.passable(1, 0)).toBe(true);
  });
  it('linearly interpolates for exactly moveTicks while retaining departure occupancy and reserving arrival', () => {
    const mover = actor('a', 1, 1), departure = actor('b', 1, 0), arrival = actor('c', 3, 1);
    const world = new MapState('map', mapData(), [mover, departure, arrival]);
    expect(world.tryMove(mover, 'right')).toBe(true);
    expect(world.tryMove(departure, 'down')).toBe(false); expect(world.tryMove(arrival, 'left')).toBe(false);
    ticks(world, 2); expect(mover.x).toBe(1); expect(mover.pixelX).toBe(24);
    expect(mover.destination).toMatchObject({ x: 2, y: 1 });
    ticks(world, 2); expect(mover.x).toBe(2); expect(mover.pixelX).toBe(32); expect(mover.destination).toBeUndefined();
    expect(world.tryMove(departure, 'down')).toBe(true); expect(world.tryMove(arrival, 'left')).toBe(false);
    expect(world.tryMove(mover, 'down')).toBe(true); ticks(world, 4);
    expect(world.tryMove(arrival, 'left')).toBe(true);
  });
  it('prevents swaps and competing reservations without interrupting an existing move', () => {
    const a = actor('a', 1, 1), b = actor('b', 2, 1), c = actor('c', 1, 3);
    const world = new MapState('map', mapData(), [a, b, c]);
    expect(world.tryMove(a, 'right')).toBe(false); expect(world.tryMove(b, 'left')).toBe(false);
    expect(world.tryMove(a, 'down')).toBe(true); expect(world.tryMove(c, 'up')).toBe(false);
    expect(world.tryMove(a, 'left')).toBe(false); expect(a.dir).toBe('down');
  });
  it('through/inactive events do not occupy or reserve, but hidden active events still block', () => {
    const player = actor('p', 1, 1), event = actor('event', 2, 1);
    const world = new MapState('map', mapData(), [player, event]);
    event.visible = false; expect(world.canEnter(player, 2, 1)).toBe(false);
    event.active = false; expect(world.canEnter(player, 2, 1)).toBe(true);
    event.active = true; event.through = true; expect(world.canEnter(player, 2, 1)).toBe(true);
    expect(world.tryMove(event, 'down')).toBe(true); expect(world.canEnter(player, 2, 2)).toBe(true);
  });
  it('a through mover bypasses characters but obeys collision and bounds', () => {
    const through = actor('ghost', 0, 0), blocker = actor('p', 1, 0);
    through.through = true;
    const world = new MapState('map', mapData([5]), [through, blocker]);
    expect(world.tryMove(through, 'left')).toBe(false); expect(world.tryMove(through, 'down')).toBe(false);
    expect(world.tryMove(through, 'right')).toBe(true);
  });
  it('holding a direction continues in whole tile steps; releasing finishes the step', () => {
    const player = new Player('p', 1, 1, 'down', 16, placeholder), world = new MapState('map', mapData(), [player]);
    const tick = (frame: InputFrame) => { player.handleInput(frame, world); world.advance(); };
    for (let i = 0; i < 8; i++) tick(input('right'));
    expect(player.x).toBe(3); tick(input('right')); tick(input()); tick(input()); tick(input());
    expect(player.x).toBe(4); expect(player.moving).toBe(false);
    for (let i = 0; i < 4; i++) tick(input('right'));
    expect(player.x).toBe(4); expect(player.dir).toBe('right');
  });
  it('uses deterministic single direction priority and ignores turn input during movement', () => {
    const player = new Player('p', 2, 2, 'down', 16, placeholder), world = new MapState('map', mapData(), [player]);
    player.handleInput(input('right', 'up'), world); expect(player.dir).toBe('up');
    player.handleInput(input('left'), world); expect(player.dir).toBe('up'); expect(player.destination).toMatchObject({ x: 2, y: 1 });
  });
});

describe('M2 GameState', () => {
  it('copies declared initial values, tracks changes and isolates per-event self flags', () => {
    const initial = { flags: { met: false }, vars: { gold: 0 } }, state = new GameState(initial);
    initial.flags.met = true; expect(state.getFlag('met')).toBe(false);
    state.setFlag('met', false); expect(state.dirty).toBe(false);
    state.setVar('gold', 10); expect(state.getVar('gold')).toBe(10); expect(state.dirty).toBe(true);
    state.clearDirty(); expect(state.dirty).toBe(false);
    expect(state.getSelf('map', 'chest', 'opened')).toBe(false);
    state.setSelf('map', 'chest', 'opened', true);
    expect(state.getSelf('map', 'chest', 'opened')).toBe(true); expect(state.getSelf('map', 'other', 'opened')).toBe(false);
  });
  it('rejects undeclared keys and unsafe integers without changing state', () => {
    const state = new GameState({ flags: { met: false }, vars: { gold: 0 } });
    expect(() => state.getFlag('unknown')).toThrow('Undeclared'); expect(() => state.setFlag('unknown', true)).toThrow('Undeclared');
    expect(() => state.getVar('unknown')).toThrow('Undeclared'); expect(() => state.setVar('unknown', 1)).toThrow('Undeclared');
    for (const value of [1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => state.setVar('gold', value)).toThrow('Unsafe');
    expect(state.getVar('gold')).toBe(0); expect(state.dirty).toBe(false);
    expect(() => new GameState({ flags: {}, vars: { bad: 1.5 } })).toThrow();
  });
});

describe('M2 character graphics', () => {
  it('cycles configured walk frames and returns to first frame at rest', () => {
    const graphic: CharacterDefinition = { sheet: 'hero.png', frameWidth: 16, frameHeight: 24, frameTicks: 2, walkFrames: [2, 3, 2, 4], moveTicks: 16 };
    const player = new Character('p', 1, 1, 'down', 16, graphic), world = new MapState('map', mapData(), [player]);
    expect(player.snapshot().frame).toBe(2); world.tryMove(player, 'right'); ticks(world, 2);
    expect(player.snapshot().frame).toBe(3); ticks(world, 4); expect(player.snapshot().frame).toBe(4);
    ticks(world, 10); expect(player.snapshot().frame).toBe(2);
    expect(player.snapshot().graphic).toMatchObject({ rows: { down: 0, left: 1, right: 2, up: 3 } });
  });
  it('draws sheets bottom-centered and skips hidden/inactive characters', () => {
    const player = new Character('p', 1, 1, 'left', 16, { sheet: 'hero.png', frameWidth: 16, frameHeight: 24 });
    const hidden = actor('hidden', 0, 0); hidden.visible = false;
    const inactive = actor('inactive', 0, 0); inactive.active = false;
    const drawImage = vi.fn(), fillRect = vi.fn();
    const context = { drawImage, fillRect } as unknown as CanvasRenderingContext2D;
    const image = {} as CanvasImageSource;
    drawCharacters(context, [player.snapshot(), hidden.snapshot(), inactive.snapshot()], new Map([['hero.png', image]]), 16, { x: 3, y: 4 });
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(image, 0, 24, 16, 24, 13, 4, 16, 24);
    expect(fillRect).not.toHaveBeenCalled();
  });
  it.each(['up', 'down', 'left', 'right'] as const)('draws tile-sized placeholder and direction triangle for %s', dir => {
    const player = actor('p', 1, 1); player.dir = dir;
    const fillRect = vi.fn(), moveTo = vi.fn(), fill = vi.fn();
    const context = { fillRect, moveTo, lineTo: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), fill } as unknown as CanvasRenderingContext2D;
    drawCharacters(context, [player.snapshot()], new Map(), 16, { x: 3, y: 4 });
    expect(fillRect).toHaveBeenCalledExactlyOnceWith(13, 12, 16, 16);
    const point = { up: [21, 15], down: [21, 25], left: [16, 20], right: [26, 20] }[dir];
    expect(moveTo).toHaveBeenCalledExactlyOnceWith(...point); expect(fill).toHaveBeenCalledOnce();
  });
});

it('demo starts with player-first stable y sort and cannot walk through elder or house walls', async () => {
  const source = { readJson: async (path: string) => JSON.parse(readFileSync(`packs/demo/${path}`, 'utf8')), exists: async () => true };
  const config = await source.readJson('game.json'), characters = await source.readJson('characters.json');
  const events = await source.readJson('maps/village.events.json');
  const data = await loadTiled(source, 'maps/village.tmj', 16);
  const game = new Game(config, data, characters, events.events), twin = new Game(config, data, characters, events.events);
  expect(game.snapshot.characters.map(character => character.id)).toEqual(['player', 'elder', 'flower']);
  const initial = game.snapshot;
  for (let i = 0; i < 64; i++) { game.tick(input('right')); twin.tick(input('right')); }
  expect(game.player.x).toBe(16); expect(game.player.y).toBe(10); expect(game.player.dir).toBe('right');
  expect(game.snapshot).toEqual(twin.snapshot); expect(initial.player.pixelX).toBe(240);
  for (let i = 0; i < 48; i++) game.tick(input('up'));
  expect(game.player.y).toBe(7);
  for (let i = 0; i < 160; i++) game.tick(input('left'));
  expect(game.player.x).toBe(10); expect(game.player.dir).toBe('left');
});

it('events without graphics still block and can occupy wall tiles; duplicate event IDs are rejected', () => {
  const config = { title: '', tileSize: 16, screen: { width: 320, height: 240 }, maps: ['map'],
    start: { map: 'map', x: 1, y: 1, dir: 'down' as const }, player: 'hero', state: { flags: {}, vars: {} } };
  const event = { id: 'invisible', x: 2, y: 1, pages: [{ trigger: 'none' as const }] };
  const game = new Game(config, mapData(), { hero: placeholder }, [event]);
  expect(game.map.canEnter(game.player, 2, 1)).toBe(false);
  expect(game.snapshot.characters[1]?.graphic).toBeUndefined();
  const onWall = { ...event, x: 0, y: 0 };
  expect(() => new Game(config, mapData([0]), { hero: placeholder }, [onWall])).not.toThrow();
  expect(() => new Game(config, mapData([6]), { hero: placeholder }, [])).toThrow('Player starts on collision');
  expect(() => new Game(config, mapData(), { hero: placeholder }, [event, event])).toThrow('Duplicate event');
});

it('rejects diagonal/fractional movement and invalid animation timing', () => {
  const player = actor('p', 1, 1);
  expect(() => player.beginMove(1.5, 1.5)).toThrow('Invalid movement');
  expect(() => new Character('p', 0, 0, 'down', 16, { placeholder: '#123456', moveTicks: 0 })).toThrow('moveTicks');
  expect(() => new Character('p', 0, 0, 'down', 16, { sheet: 'hero.png', frameWidth: 16, frameHeight: 24, frameTicks: 0 })).toThrow('sheet');
});

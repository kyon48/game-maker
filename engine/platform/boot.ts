import './style.css';
import { loadTiled } from '../data/loader/tiled';
import { camera } from '../sim/world/Camera';
import { FetchSource } from './fetchSource';
import { Keyboard } from './keyboard';
import { FixedTickLoop, startLoop } from './loop';
import { drawTileMap } from './renderer/tileMap';
import { resizeCanvas } from './scale';
import type { GameConfig, EventDefinition } from '../data/game';
import type { Characters } from '../data/characters';
import { Game } from '../sim/Game';
import { drawCharacters } from './renderer/characters';
import { drawUi } from './renderer/ui';
import { CanvasTextMeasurer } from './textMeasurer';
import type { Skin } from '../data/skin';
const app = document.querySelector<HTMLElement>('#app')!;
function fail(error: unknown): void {
  const output = document.createElement('pre'); output.textContent = String(error); app.replaceChildren(output);
}
async function boot(): Promise<void> {
  const id = new URLSearchParams(location.search).get('pack');
  if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Specify ?pack=<packId>');
  const source = new FetchSource(`/packs/${id}/`);
  const game = await source.readJson('game.json') as GameConfig;
  if (!game.screen || !Number.isInteger(game.screen.width) || game.screen.width <= 0
    || !Number.isInteger(game.screen.height) || game.screen.height <= 0
    || !game.maps?.includes(game.start.map)) throw new Error('Invalid game configuration');
  const map = await loadTiled(source, `maps/${game.start.map}.tmj`, game.tileSize);
  const [characters, mapEvents, skin] = await Promise.all([
    source.readJson('characters.json') as Promise<Characters>,
    source.readJson(`maps/${game.start.map}.events.json`) as Promise<{ events: EventDefinition[] }>,
    source.readJson('skin.json') as Promise<Skin>,
  ]);
  const font = new FontFace(skin.font.family, `url(${JSON.stringify(source.url(skin.font.src))})`);
  document.fonts.add(await font.load());
  await document.fonts.ready;
  const canvas = document.createElement('canvas'); canvas.width = game.screen.width; canvas.height = game.screen.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D unavailable');
  context.font = `${skin.font.size}px ${JSON.stringify(skin.font.family)}`;
  const simulation = new Game(game, map, characters, mapEvents.events, { skin, textMeasurer: new CanvasTextMeasurer(context) });
  const images = new Map<string, HTMLImageElement>();
  const paths = new Set(map.tilesets.map(set => set.image));
  for (const graphic of Object.values(characters)) if (graphic.sheet) paths.add(graphic.sheet);
  if (skin.window.image) paths.add(skin.window.image);
  await Promise.all([...paths].map(async path => {
    const image = new Image(); image.src = source.url(path); await image.decode(); images.set(path, image);
  }));
  document.title = game.title;
  app.replaceChildren(canvas);
  const keyboard = new Keyboard(window);
  const size = { width: map.width * map.tilewidth, height: map.height * map.tileheight };
  const resize = () => resizeCanvas(canvas); resize(); window.addEventListener('resize', resize);
  const stop = startLoop(new FixedTickLoop(input => simulation.tick(input), () => keyboard.consume(), () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const snapshot = simulation.snapshot;
    const view = camera({ x: snapshot.player.pixelX + game.tileSize / 2,
      y: snapshot.player.pixelY + game.tileSize / 2 }, size, game.screen);
    drawTileMap(context, map, images, view, 'below');
    drawCharacters(context, snapshot.characters, images, game.tileSize, view);
    drawTileMap(context, map, images, view, 'over');
    drawUi(context, snapshot, skin, images);
  }), error => { keyboard.dispose(); fail(error); });
  window.addEventListener('pagehide', () => { stop(); keyboard.dispose(); window.removeEventListener('resize', resize); }, { once: true });
}
void boot().catch(fail);

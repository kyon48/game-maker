import { builtinCatalog } from '../sim/commands';
import { PackValidationError, showError } from './errorScreen';
import './style.css';
import { MapCache } from '../data/loader/MapCache';
import { BrowserMapLoader } from './mapLoader';
import type { Command } from '../data/events';
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
  showError(app, error);
}
async function boot(): Promise<void> {
  const id = new URLSearchParams(location.search).get('pack');
  if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Specify ?pack=<packId>');
  const source = new FetchSource(`/packs/${id}/`, import.meta.env.DEV ? `/__pack-files?pack=${id}` : undefined);
  if (import.meta.env.DEV) {
    const { validatePack } = await import('../data/validator/validate');
    const { diagnostics } = await validatePack(source, id, { commands: builtinCatalog() });
    for (const warning of diagnostics.filter(item => item.level === 'warning')) console.warn(`${warning.file}${warning.pointer} ${warning.code}: ${warning.message}`);
    if (diagnostics.some(item => item.level === 'error')) throw new PackValidationError(diagnostics);
  }
  const game = await source.readJson('game.json') as GameConfig;
  const [characters, entries, skin, commonEvents] = await Promise.all([
    source.readJson('characters.json') as Promise<Characters>,
    Promise.all(game.maps.map(async id => [id, (await source.readJson(`maps/${id}.events.json`) as { events: EventDefinition[] }).events] as const)),
    source.readJson('skin.json') as Promise<Skin>,
    source.readJson('common-events.json') as Promise<Record<string, { commands: Command[] }>>,
  ]);
  const loader = new BrowserMapLoader(new MapCache(source, game.tileSize, new Map(entries)), characters, path => source.url(path));
  const font = new FontFace(skin.font.family, `url(${JSON.stringify(source.url(skin.font.src))})`);
  document.fonts.add(await font.load());
  await document.fonts.ready;
  const initial = await loader.load(game.start.map);
  const playerGraphic = characters[game.player];
  if (playerGraphic?.sheet) await loader.image(playerGraphic.sheet);
  if (skin.window.image) await loader.image(skin.window.image);
  const canvas = document.createElement('canvas'); canvas.width = game.screen.width; canvas.height = game.screen.height;
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D unavailable');
  context.font = `${skin.font.size}px ${JSON.stringify(skin.font.family)}`;
  const simulation = new Game(game, initial.data, characters, initial.events, { skin, textMeasurer: new CanvasTextMeasurer(context), mapLoader: loader, commonEvents });
  const images = loader.images;
  document.title = game.title;
  app.replaceChildren(canvas);
  const keyboard = new Keyboard(window);
  const resize = () => resizeCanvas(canvas); resize(); window.addEventListener('resize', resize);
  const stop = startLoop(new FixedTickLoop(input => simulation.tick(input), () => keyboard.consume(), () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const snapshot = simulation.snapshot;
    const map = simulation.map.data;
    const size = { width: map.width * map.tilewidth, height: map.height * map.tileheight };
    const view = camera({ x: snapshot.player.pixelX + game.tileSize / 2,
      y: snapshot.player.pixelY + game.tileSize / 2 }, size, game.screen, { x: snapshot.shake, y: 0 });
    drawTileMap(context, map, images, view, 'below');
    drawCharacters(context, snapshot.characters, images, game.tileSize, view);
    drawTileMap(context, map, images, view, 'over');
    if (snapshot.fade > 0) {
      context.save(); context.globalAlpha = snapshot.fade; context.fillStyle = skin.colors.fade;
      context.fillRect(0, 0, canvas.width, canvas.height); context.restore();
    }
    drawUi(context, snapshot, skin, images);
  }), error => { keyboard.dispose(); fail(error); });
  window.addEventListener('pagehide', () => { stop(); keyboard.dispose(); window.removeEventListener('resize', resize); }, { once: true });
}
void boot().catch(fail);

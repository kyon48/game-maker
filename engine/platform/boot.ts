import './style.css';
import { loadTiled } from '../data/loader/tiled';
import { camera } from '../sim/world/Camera';
import { FetchSource } from './fetchSource';
import { Keyboard } from './keyboard';
import { FixedTickLoop, startLoop } from './loop';
import { drawTileMap } from './renderer/tileMap';
import { resizeCanvas } from './scale';
interface GameConfig {
  title: string; tileSize: number; screen: { width: number; height: number };
  maps: string[]; start: { map: string; x: number; y: number };
}
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
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(map.tilesets.map(async set => {
    const image = new Image(); image.src = source.url(set.image); await image.decode(); images.set(set.image, image);
  }));
  document.title = game.title;
  const canvas = document.createElement('canvas'); canvas.width = game.screen.width; canvas.height = game.screen.height;
  app.replaceChildren(canvas);
  const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas 2D unavailable');
  const keyboard = new Keyboard(window);
  const target = { x: (game.start.x + 0.5) * game.tileSize, y: (game.start.y + 0.5) * game.tileSize };
  const size = { width: map.width * map.tilewidth, height: map.height * map.tileheight };
  const resize = () => resizeCanvas(canvas); resize(); window.addEventListener('resize', resize);
  const stop = startLoop(new FixedTickLoop(input => {
    // M1 임시 카메라 입력. M2에서 플레이어 보간 위치로 교체.
    target.x = Math.max(0, Math.min(size.width, target.x + 2 * (Number(input.held.has('right')) - Number(input.held.has('left')))));
    target.y = Math.max(0, Math.min(size.height, target.y + 2 * (Number(input.held.has('down')) - Number(input.held.has('up')))));
  }, () => keyboard.consume(), () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    const view = camera(target, size, game.screen);
    drawTileMap(context, map, images, view, 'below');
    drawTileMap(context, map, images, view, 'over');
  }), error => { keyboard.dispose(); fail(error); });
  window.addEventListener('pagehide', () => { stop(); keyboard.dispose(); window.removeEventListener('resize', resize); }, { once: true });
}
void boot().catch(fail);

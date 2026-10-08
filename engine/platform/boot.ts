import runtime from 'virtual:pack-runtime';
import { packLocation } from './packLocation';
import { SaveStorage } from './storage';
import { readSave, restoreSave } from '../sim/state/loadSave';
import { chooseStart } from './startChoice';
import pluginLoaders from 'virtual:pack-plugins';
import { PluginRuntime } from '../sim/plugins/PluginRuntime';
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
import type { Film } from '../data/schema/film';
import { drawCharacters } from './renderer/characters';
import { drawUi } from './renderer/ui';
import { CanvasTextMeasurer } from './textMeasurer';
import type { Skin } from '../data/skin';
const app = document.querySelector<HTMLElement>('#app')!;
let cleanup = () => {};
function fail(error: unknown): void {
  cleanup(); showError(app, error, runtime.buildInfo);
}
async function boot(): Promise<void> {
  if (import.meta.env.DEV && !new URL(location.href).searchParams.has('pack')) {
    const list = document.createElement('nav');
    for (const id of Object.keys(runtime.roots)) {
      const link = document.createElement('a'), url = new URL(location.href); url.searchParams.set('pack', id);
      link.href = url.href; link.textContent = id; list.append(link, document.createElement('br'));
    }
    app.replaceChildren(list); return;
  }
  const recordName = (import.meta.env.DEV || __RECORDING__) ? new URL(location.href).searchParams.get('record') : null;
  if (recordName && !/^[a-z][a-z0-9_]*$/.test(recordName)) throw new Error('Invalid film id');
  const locationInfo = packLocation(runtime, location.href);
  const { id } = locationInfo;
  const source = new FetchSource(locationInfo.root, locationInfo.inventory, locationInfo.cacheKey);
  const game = await source.readJson('game.json') as GameConfig;
  const modules = await (pluginLoaders[id]?.() ?? Promise.resolve([])).catch(error => {
    if (error && Array.isArray(error.diagnostics)) throw new PackValidationError(error.diagnostics);
    throw error;
  });
  const plugins = new PluginRuntime(runtime.engineVersion, modules.map((module, index) => ({ name: game.plugins[index]!, module })));
  if (plugins.diagnostics.length) throw new PackValidationError(plugins.diagnostics);
  if (import.meta.env.DEV) {
    const { validatePack } = await import('../data/validator/validate');
    const { diagnostics } = await validatePack(source, id, plugins.validationOptions);
    for (const warning of diagnostics.filter(item => item.level === 'warning')) console.warn(`${warning.file}${warning.pointer} ${warning.code}: ${warning.message}`);
    if (diagnostics.some(item => item.level === 'error')) throw new PackValidationError(diagnostics);
  }
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
  const film: Film | null = recordName ? (window.__filmRequest?.film ?? (import.meta.env.DEV ? await source.readJson(`films/${recordName}.film.json`) as Film : null)) : null;
  if (recordName && !film) throw new Error('Recording a build requires film data from npm run film');
  // Freeze IO before manual stepping; sim still receives its existing asynchronous map port.
  const prepared = film ? new Map(await Promise.all(game.maps.map(async id => [id, await loader.load(id)] as const))) : null;
  const storage = new SaveStorage(() => localStorage, { packId: game.id, gameVersion: game.version, engineVersion: runtime.engineVersion });
  const candidate = readSave(film ? null : storage.read(), game.id);
  const savedMap = typeof candidate.data?.map === 'string' && game.maps.includes(candidate.data.map) ? candidate.data.map : game.start.map;
  const savedData = candidate.data ? await loader.load(savedMap) : undefined;
  const restored = restoreSave(candidate, game, new Map(entries), new Map(savedData ? [[savedMap, savedData.data]] : []));
  for (const warning of restored.warnings) console.warn(warning);
  const playerGraphic = characters[game.player];
  if (playerGraphic?.sheet) await loader.image(playerGraphic.sheet);
  if (skin.window.image) await loader.image(skin.window.image);
  const canvas = document.createElement('canvas'); canvas.width = game.screen.width; canvas.height = game.screen.height;
  const context = canvas.getContext('2d', film ? { willReadFrequently: true } : undefined); if (!context) throw new Error('Canvas 2D unavailable');
  context.font = `${skin.font.size}px ${JSON.stringify(skin.font.family)}`;
  const images = loader.images;
  document.title = game.title;
  app.replaceChildren(canvas);
  const keyboard = film ? null : new Keyboard(window);
  const resize = () => resizeCanvas(canvas); resize(); window.addEventListener('resize', resize);
  cleanup = () => { keyboard?.dispose(); window.removeEventListener('resize', resize); };
  const continued = restored.state && await chooseStart(context, skin, images, keyboard!, [game.labels.continue, game.labels.newGame]) === 0;
  const state = continued ? restoreSave(candidate, game, new Map(entries), new Map(savedData ? [[savedMap, savedData.data]] : []), {
    loadSave: (state, from) => plugins.loadSave(state, candidate.data!, from),
  }).state! : null;
  const start = film?.start ?? (state ? { map: state.map, x: state.x, y: state.y, dir: state.dir } : game.start);
  const initial = await loader.load(start.map);
  const simulation = new Game({ ...game, start, state: film ? { flags: { ...game.state.flags, ...film.state?.flags }, vars: { ...game.state.vars, ...film.state?.vars } } : state ? { flags: state.flags, vars: state.vars } : game.state }, initial.data, characters, initial.events, {
    plugins, skin, textMeasurer: new CanvasTextMeasurer(context), mapLoader: prepared ? { load: id => { const map = prepared.get(id); return map ? Promise.resolve(map) : Promise.reject(new Error(`Unknown map: ${id}`)); } } : loader, commonEvents,
    selfFlags: state?.selfFlags, save: value => { if (!film) storage.write(value); },
  });
  const render = () => {
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
  };
  if ((import.meta.env.DEV || __RECORDING__) && film) {
    const { createRecorder } = await import('./recorder');
    window.__recorder = createRecorder(simulation, film, window.__filmRequest?.fps ?? film.fps ?? 30, context, render);
    render(); return;
  }
  const stop = startLoop(new FixedTickLoop(input => simulation.tick(input), () => keyboard!.consume(), render), error => { keyboard?.dispose(); fail(error); });
  cleanup = () => { stop(); keyboard?.dispose(); window.removeEventListener('resize', resize); };
  window.addEventListener('pagehide', () => cleanup(), { once: true });
}
void boot().catch(fail);

import type { Characters } from '../data/characters';
import type { MapCache } from '../data/loader/MapCache';
import type { LoadedMap, MapLoader } from '../sim/world/MapLoader';
/** Browser assets stay in platform; in-flight requests and decoded maps are reused. */
export class BrowserMapLoader implements MapLoader {
  readonly images = new Map<string, HTMLImageElement>();
  private readonly assets = new Map<string, Promise<void>>();
  private readonly maps = new Map<string, Promise<LoadedMap>>();
  constructor(private readonly cache: MapCache, private readonly characters: Characters,
    private readonly url: (path: string) => string) {}
  image(path: string): Promise<void> {
    let pending = this.assets.get(path);
    if (!pending) {
      pending = (async () => { const image = new Image(); image.src = this.url(path); await image.decode(); this.images.set(path, image); })();
      this.assets.set(path, pending);
      void pending.catch(() => this.assets.delete(path));
    }
    return pending;
  }
  load(id: string): Promise<LoadedMap> {
    let pending = this.maps.get(id);
    if (!pending) {
      pending = (async () => {
        const data = await this.cache.load(id), events = this.cache.events.get(id)!;
        const paths = new Set(data.tilesets.map(set => set.image));
        for (const event of events) for (const page of event.pages) {
          const graphic = page.character && this.characters[page.character];
          if (graphic && graphic.sheet) paths.add(graphic.sheet);
        }
        await Promise.all([...paths].map(path => this.image(path)));
        return { data, events };
      })();
      this.maps.set(id, pending);
      void pending.catch(() => this.maps.delete(id));
    }
    return pending;
  }
}

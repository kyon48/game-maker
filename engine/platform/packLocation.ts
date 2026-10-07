import type { PackRuntime } from '../data/buildInfo';
export function packLocation(runtime: PackRuntime, page: string): { id: string; root: string; inventory?: string; cacheKey?: string } {
  const url = new URL(page), id = runtime.fixedPackId ?? url.searchParams.get('pack');
  if (!id || !/^[a-z][a-z0-9_]*$/.test(id)) throw new Error('Specify ?pack=<packId>');
  const root = runtime.fixedPackId ? new URL('./pack/', url).href : runtime.roots[id];
  if (!root) throw new Error(`Unknown pack: ${id}`);
  return { id, root, inventory: runtime.inventory ? runtime.inventory + '?pack=' + encodeURIComponent(id) : undefined, cacheKey: runtime.cacheKey ?? undefined };
}

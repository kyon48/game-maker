import type { Location } from './ast';
export interface LegendTile { tile: string; collide?: boolean; under?: string }
export interface LegendSet { image: string; columns: number; tileSize: number; spacing?: number; rows: number }
export interface Legend { tilesets: Record<string, LegendSet>; legend: Record<string, LegendTile> }
export function parseLegend(value: unknown): Legend {
  const data = value as Legend;
  if (!data || !data.tilesets || !data.legend || !Object.keys(data.tilesets).length || !Object.keys(data.legend).length) throw new Error('tilesets와 legend가 필요합니다');
  for (const [name, set] of Object.entries(data.tilesets)) {
    if (!/^[a-z][a-z0-9_]*$/.test(name) || !set.image || /(^\/|\\|\.\.)/.test(set.image) || !Number.isInteger(set.columns) || set.columns < 1 || !Number.isInteger(set.tileSize) || set.tileSize < 1 || !Number.isInteger(set.rows) || set.rows < 1 || set.spacing !== undefined && (!Number.isInteger(set.spacing) || set.spacing < 0)) throw new Error(`타일셋 형식 오류: ${name}`);
  }
  for (const [char, entry] of Object.entries(data.legend)) {
    if ([...char].length !== 1 || /\s/.test(char) || !entry || typeof entry.tile !== 'string' || entry.collide !== undefined && typeof entry.collide !== 'boolean') throw new Error(`범례 형식 오류: ${char}`);
    const match = /^([a-z][a-z0-9_]*):(\d+)$/.exec(entry.tile), set = match && data.tilesets[match[1]!];
    if (!match || !set || Number(match[2]) >= set.columns * set.rows) throw new Error(`타일 번호 범위 오류: ${entry.tile}`);
    if (entry.under !== undefined && (!data.legend[entry.under] || data.legend[entry.under]!.under !== undefined)) throw new Error(`under는 바닥 범례 한 단계만 참조합니다: ${char}`);
  }
  return data;
}
export function legendMap(location: Location, size: number, tiles: Legend, objects: unknown[]) {
  let gid = 1;
  const starts = new Map<string,number>();
  const sets = Object.entries(tiles.tilesets).sort(([a],[b])=>a.localeCompare(b)).map(([name,s])=>{ if (s.tileSize !== size) throw new Error('tileSize가 game과 다릅니다'); const firstgid = gid; starts.set(name,gid); gid += s.columns*s.rows; return {firstgid,image:'../'+s.image,tilewidth:size,tileheight:size,columns:s.columns,tilecount:s.columns*s.rows,spacing:s.spacing ?? 0}; });
  const tile = (char: string) => { const entry=tiles.legend[char]; if (!entry) throw new Error(`범례에 없는 글자: ${char}`); const [name,n]=entry.tile.split(':'); return starts.get(name!)!+Number(n); };
  const anchors = new Set(location.anchors.map(a=>a.character)), rows=location.layout!.rows.map(r=>[...r.text]), width=rows[0]!.length,height=rows.length;
  const cells=rows.flat().map(c=>anchors.has(c)?(location.floor??'.'):c==='#'?(location.wall??'#'):c==='.'?(location.floor??'.'):c);
  const floor=cells.map(c=>tile(tiles.legend[c]?.under??c)), decoration=cells.map(c=>tiles.legend[c]?.under?tile(c):0), collision=cells.map(c=>tiles.legend[c]?.collide?tile(c):0);
  return {orientation:'orthogonal',infinite:false,width,height,tilewidth:size,tileheight:size,layers:[{id:1,name:'floor',type:'tilelayer',width,height,data:floor},{id:2,name:'decoration',type:'tilelayer',width,height,data:decoration},{id:3,name:'collision',type:'tilelayer',width,height,data:collision},{id:4,name:'markers',type:'objectgroup',objects}],tilesets:sets};
}

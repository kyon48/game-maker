import { expect, it, vi } from 'vitest';
import { camera } from '../engine/sim/world/Camera';
import { FixedTickLoop } from '../engine/platform/loop';
import { Keyboard } from '../engine/platform/keyboard';
import { integerScale } from '../engine/platform/scale';
import { loadTiled, markers, tileGid } from '../engine/data/loader/tiled';
import { packPath } from '../engine/data/loader/path';
import { HeadlessTextMeasurer } from '../engine/data/loader/textMeasurer';
import { drawTileMap } from '../engine/platform/renderer/tileMap';
import type { Action, PackSource } from '../engine/sim/ports';
import { readFileSync } from 'node:fs';
const mapJson = JSON.parse(readFileSync('packs/demo/maps/village.tmj', 'utf8'));
const source = (files: Record<string, unknown>): PackSource => ({
  readJson: async path => { if (!(path in files)) throw new Error(path); return files[path]; },
  exists: async path => path in files,
});
function key(target: EventTarget, type: string, code: string, repeat = false) {
  const event = new Event(type, { cancelable: true }); Object.assign(event, { code, repeat }); target.dispatchEvent(event); return event;
}
it('buffers quick key presses until a tick and consumes pressed only once during catch-up', () => {
  const target = new EventTarget(), keyboard = new Keyboard(target), frames: ReadonlySet<Action>[] = [];
  const render = vi.fn(), loop = new FixedTickLoop(input => frames.push(input.pressed), () => keyboard.consume(), render);
  loop.frame(0); key(target, 'keydown', 'KeyZ'); key(target, 'keyup', 'KeyZ'); loop.frame(5);
  expect(frames).toHaveLength(0); loop.frame(50); expect(frames).toHaveLength(3);
  expect([...frames[0]!]).toEqual(['ok']); expect(frames.slice(1).every(frame => frame.size === 0)).toBe(true);
  expect(render).toHaveBeenCalledTimes(3); keyboard.dispose();
});
it('clamps long gaps to fifteen ticks and runs at 60 Hz', () => {
  const tick = vi.fn(), loop = new FixedTickLoop(tick, () => ({ held: new Set(), pressed: new Set() }), vi.fn());
  loop.frame(0); loop.frame(10000); expect(tick).toHaveBeenCalledTimes(15);
  for (let i = 1; i <= 60; i++) loop.frame(10000 + i * 1000 / 60);
  expect(tick).toHaveBeenCalledTimes(75);
});
it('preserves simultaneous keys for the same action, ignores repeats and clears on blur/disposal', () => {
  const target = new EventTarget(), keyboard = new Keyboard(target);
  expect(key(target, 'keydown', 'ArrowUp').defaultPrevented).toBe(true);
  key(target, 'keydown', 'KeyW'); key(target, 'keyup', 'ArrowUp'); expect(keyboard.consume().held.has('up')).toBe(true);
  key(target, 'keydown', 'KeyW', true); expect(keyboard.consume().pressed.size).toBe(0);
  target.dispatchEvent(new Event('blur')); expect(keyboard.consume().held.size).toBe(0);
  keyboard.dispose(); key(target, 'keydown', 'KeyW'); expect(keyboard.consume().pressed.size).toBe(0);
});
it.each([['ArrowDown','down'],['KeyS','down'],['ArrowLeft','left'],['KeyA','left'],['ArrowRight','right'],['KeyD','right'],['Enter','ok'],['Space','ok'],['KeyX','cancel'],['Escape','cancel']])('maps %s to %s', (code, action) => {
  const target = new EventTarget(), keyboard = new Keyboard(target); key(target, 'keydown', code);
  expect([...keyboard.consume().pressed]).toEqual([action]); keyboard.dispose();
});
it('centers camera, clamps map edges and centers small axes before shake', () => {
  expect(camera({x:240,y:160}, {width:480,height:320}, {width:320,height:240})).toEqual({x:80,y:40});
  expect(camera({x:999,y:-20}, {width:480,height:320}, {width:320,height:240})).toEqual({x:160,y:0});
  expect(camera({x:0,y:0}, {width:160,height:80}, {width:320,height:240}, {x:3,y:-2})).toEqual({x:-77,y:-82});
});
it('scales by maximum fitting integer with minimum one and measures Unicode codepoints', () => {
  expect(integerScale(320,240,1000,700)).toBe(2); expect(integerScale(320,240,100,100)).toBe(1);
  expect(integerScale(320,240,1280,960)).toBe(4); expect(new HeadlessTextMeasurer(12).width('A가😀')).toBe(30);
});
it('loads demo and floors marker coordinates, masking flip flags', async () => {
  const map = await loadTiled(source({'maps/village.tmj':mapJson}), 'maps/village.tmj',16);
  expect(map.tilesets[0]?.image).toBe('assets/tilesets/colors.png'); expect(markers(map).get('center')).toEqual({x:15,y:10});
  expect(tileGid(0xe0000008)).toBe(8);
});
it('resolves external tsj images relative to their owner and supports multiple firstgids', async () => {
  const raw = {...mapJson,tilesets:[{firstgid:9,source:'../assets/tilesets/colors.tsj'},mapJson.tilesets[0]]};
  const map = await loadTiled(source({'maps/a.tmj':raw,'assets/tilesets/colors.tsj':{...mapJson.tilesets[0],image:'colors.png'}}),'maps/a.tmj',16);
  expect(map.tilesets.map(set=>set.firstgid)).toEqual([1,9]); expect(map.tilesets[1]?.image).toBe('assets/tilesets/colors.png');
});
it.each([{orientation:'isometric'},{infinite:true},{tilewidth:32},{layers:[{type:'group'}]},{layers:[{type:'tilelayer',width:30,height:20,data:'compressed'}]},{layers:[{type:'objectgroup',name:'markers',objects:[{name:'bad'}]}]}])('rejects unsupported map %j',async override=>{
  await expect(loadTiled(source({'map.tmj':{...mapJson,...override}}),'map.tmj',16)).rejects.toThrow();
});
it('rejects paths escaping pack while permitting sibling tileset paths',()=>{
  expect(packPath('maps/a.tmj','../assets/a.png')).toBe('assets/a.png');
  for(const path of ['../../a.png','/a.png','https://example.com/a.png','..\\a.png']) expect(()=>packPath('maps/a.tmj',path)).toThrow();
});
it('renders below then over, excludes collision/hidden and masks GIDs',async()=>{
  const map=await loadTiled(source({'maps/map.tmj':mapJson}),'maps/map.tmj',16);
  map.layers=['ground','collision','hidden','over_tree'].map((name,i)=>({type:'tilelayer',name,width:1,height:1,data:[0xe0000000+i+1],visible:name!=='hidden'}));
  const drawImage=vi.fn();
  const context={canvas:{width:320,height:240},save:vi.fn(),restore:vi.fn(),drawImage} as unknown as CanvasRenderingContext2D;
  const images=new Map([[map.tilesets[0]!.image,{} as CanvasImageSource]]);
  drawTileMap(context,map,images,{x:0,y:0},'below'); drawTileMap(context,map,images,{x:0,y:0},'over');
  expect(drawImage).toHaveBeenCalledTimes(2); expect(drawImage.mock.calls.map(call=>call[1])).toEqual([0,48]); expect(context.imageSmoothingEnabled).toBe(false);
});

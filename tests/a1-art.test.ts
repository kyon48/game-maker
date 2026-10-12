import { expect, it, afterEach } from 'vitest';
import { readFile, mkdtemp, rm, cp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { spritePixels, parseSprite, writeSprite } from '../tools/sprite';
import { pngSize } from '../engine/data/portraits';
import { parseStory } from '../tools/story/parser';
import { storyFaces } from '../tools/story/faces';
import { expressionAliases } from '../tools/story/expressions';
import { lintStories } from '../tools/story/lint';
import { compileStories } from '../tools/story/compile';
import { parseLegend } from '../tools/story/tileLegend';
import { readStories } from '../tools/story/files';
import { writePng } from '../tools/png';
import { planArt } from '../tools/story/art';
const aliases=expressionAliases(JSON.parse(await readFile('tests/fixtures/art/expressions.json','utf8')));
const baseline=(await readFile('tests/fixtures/story/valid.story.md','utf8')).replace(/\([^()]+\):/g,'(무표정):');
const game=JSON.parse(await readFile('packs/lantern/game.json','utf8'));
const spec=JSON.parse(await readFile('packs/lantern/assets/characters/sora.sprite.json','utf8'));
const dirs:string[]=[];
afterEach(async()=>{for(const dir of dirs.splice(0))await rm(dir,{recursive:true,force:true});});
const temp=async()=>{const dir=await mkdtemp(path.join(tmpdir(),'a1-test-'));dirs.push(dir);return dir;};
it('face overrides asset default, previous expression wins, aliases normalize, unknown defaults lint',()=>{
 const story=parseStory(baseline).story;const c=story.characters.find(c=>c.id==='elder')!;c.art='base';c.assetFace='soft_smile';c.face='의심';
 const event=story.scenes[0]!.items.find(n=>n.kind==='event')!;if(event.kind!=='event')throw Error();event.pages[0]!.statements=[{file:'story',line:1,kind:'dialogue',speaker:c.name,text:'default'},{file:'story',line:2,kind:'dialogue',speaker:c.name,expression:'smile',text:'explicit'},{file:'story',line:3,kind:'dialogue',speaker:c.name,text:'previous'}];
 expect([...storyFaces([story],aliases).values()].slice(0,3).map(f=>f.expression)).toEqual(['suspicious','soft_smile','soft_smile']);delete c.face;expect([...storyFaces([story],aliases).values()][0]!.expression).toBe('soft_smile');delete c.assetFace;expect([...storyFaces([story],aliases).values()][0]!.expression).toBe('neutral');c.face='missing';expect(lintStories([story],{expressions:aliases}).some(d=>d.code==='S007')).toBe(true);
});
it('character.json default is copied even when explicit dialogue uses a different face',async()=>{
 const root=await temp();await cp('tests/fixtures/art',root,{recursive:true});const data=JSON.parse(await readFile(path.join(root,'base/character.json'),'utf8'));data.defaultExpression='smile';await writeFile(path.join(root,'base/character.json'),JSON.stringify(data));
 const story=parseStory(baseline).story;for(const c of story.characters)c.art='base';const files=await planArt([story],root,aliases);expect(files.has('assets/portraits/elder/soft_smile.png')).toBe(true);expect(story.characters.find(c=>c.id==='elder')!.assetFace).toBe('soft_smile');
});
it('sprite frames are 16×24, transparent, directional and byte deterministic including the named preview',async()=>{
 const dir=await temp(),file=path.join(dir,'sprite.png');await writeSprite(spec,file);const first=await readFile(file),preview=await readFile(path.join(dir,'sprite.preview.png'));expect(pngSize(first)).toEqual({width:48,height:96});expect(pngSize(preview)).toEqual({width:384,height:800});await writeSprite(spec,file);expect(await readFile(file)).toEqual(first);expect(await readFile(path.join(dir,'sprite.preview.png'))).toEqual(preview);
 const directional=spritePixels({...spec,eyes:'#ff00ff'});
 for(let row=0;row<4;row++){const frame=directional.subarray(row*48*24*4,(row+1)*48*24*4);let dots=0;for(let i=0;i<frame.length;i+=4)if(frame[i]===255&&frame[i+1]===0&&frame[i+2]===255)dots++;expect(dots).toBe(row===3?0:row===0?6:3);}
 const pixels=spritePixels(spec);expect(pixels[3]).toBe(0);expect([...pixels].some((v,i)=>i%4===3&&v===255)).toBe(true);expect(pixels.subarray(0,48*24*4)).not.toEqual(pixels.subarray(48*24*4,48*48*4));
 let offset=8;const chunks:Buffer[]=[];while(offset<first.length){const size=first.readUInt32BE(offset);if(first.toString('ascii',offset+4,offset+8)==='IDAT')chunks.push(first.subarray(offset+8,offset+8+size));offset+=size+12;}expect(inflateSync(Buffer.concat(chunks)).length).toBe((48*4+1)*96);
});
it.each([{...spec,eyes:'blue'},{...spec,scale:3},{...spec,hair:{style:'unknown',color:'#ffffff'}},{...spec,accessories:['unknown']},{...spec,outfit:{...spec.outfit,tie:['#fff']}}])('rejects malformed sprite specs',value=>expect(()=>parseSprite(value)).toThrow());
const tiles={tilesets:{room:{image:'assets/test.png',columns:4,rows:2,tileSize:16}},legend:{'#':{tile:'room:0',collide:true},'.':{tile:'room:1'},T:{tile:'room:2',collide:true,under:'.'},G:{tile:'room:3'}}};
it('legend creates under/decoration/collision layers, applies location defaults and preserves existing maps',()=>{
 const story=parseStory(baseline).story,location=story.locations[0]!;location.floor='G';location.layout!.rows[1]!.text=location.layout!.rows[1]!.text.replace('.','T');const result=compileStories([story],game,tiles);const map=JSON.parse(result.maps.get(`maps/${location.id}.tmj`)!);const index=location.layout!.rows[0]!.text.length+1;expect(map.layers[0].data[index]).toBe(2);expect(map.layers[1].data[index]).toBe(3);expect(map.layers[2].data[index]).toBe(3);expect(map.layers[0].data[index+1]).toBe(4);expect(map.tilesets[0]).toMatchObject({firstgid:1,tilecount:8});expect([...compileStories([story],game,tiles).files]).toEqual([...result.files]);
 const existing=new Map(result.maps);const kept=compileStories([story],game,tiles,existing);expect(kept.maps).toEqual(existing);expect(kept.files.has(`maps/${location.id}.tmj`)).toBe(false);expect(compileStories([story],game,tiles,existing,true).files.has(`maps/${location.id}.tmj`)).toBe(true);
 const options={legend:new Set(Object.keys(tiles.legend)),expressions:aliases};expect(lintStories([story],options).some(d=>d.code==='S020')).toBe(false);location.anchors[0]!.character='T';expect(lintStories([story],options).some(d=>d.code==='S047')).toBe(true);
 expect(()=>parseLegend({...tiles,legend:{...tiles.legend,Q:{tile:'room:8'}}})).toThrow('범위');expect(()=>parseLegend({...tiles,legend:{...tiles.legend,T:{tile:'room:2',under:'missing'}}})).toThrow('under');
 const legacy=compileStories([parseStory(baseline).story],game,{wall:1,floor:2,door:3,tileset:'assets/old.tsj'});expect(JSON.parse([...legacy.maps.values()][0]!).layers.map((l:{name:string})=>l.name)).toEqual(['floor','collision','markers']);
});

it('portable checks retain asset defaults, honor face overrides, and notice removed original defaults',async()=>{
 const root=await temp(),folder=path.join(root,'packs/lantern/story');await mkdir(folder,{recursive:true});await cp('tests/fixtures/art',path.join(root,'art'),{recursive:true});
 const source=baseline.replace(/ voice=\S+/g,'');await writeFile(path.join(folder,'main.story.md'),source);await writeFile(path.join(folder,'story.config.json'),JSON.stringify({artRoot:'../../../art'}));await writeFile(path.join(folder,'.compiled.json'),JSON.stringify({version:1,files:{},maps:{},expressions:Object.fromEntries(aliases),defaultExpressions:{sora:'soft_smile',elder:'soft_smile'}}));
 const file=path.join(root,'art/base/character.json'),data=JSON.parse(await readFile(file,'utf8'));data.defaultExpression='부드러운 미소';await writeFile(file,JSON.stringify(data));
 expect((await readStories('lantern',root,true)).stories[0]!.characters[0]!.assetFace).toBe('soft_smile');delete data.defaultExpression;await writeFile(file,JSON.stringify(data));expect((await readStories('lantern',root,true)).stories[0]!.characters[0]!.assetFace).toBeUndefined();
 await rm(path.join(root,'art'),{recursive:true});const cached=await readStories('lantern',root,true);expect(cached.diagnostics.some(d=>d.code==='S039')).toBe(true);expect(cached.stories[0]!.characters[0]!.assetFace).toBe('soft_smile');
 await writeFile(path.join(folder,'main.story.md'),source.replace('art=base','art=base face=neutral'));const overridden=await readStories('lantern',root,true);expect([...storyFaces(overridden.stories,aliases).values()][0]!.expression).toBe('neutral');
});
it('pack lint derives tile rows from PNG and diagnoses range, undeclared layout and anchor collisions',async()=>{
 const root=await temp(),folder=path.join(root,'packs/lantern'),story=path.join(folder,'story');await mkdir(story,{recursive:true});await writeFile(path.join(story,'main.story.md'),baseline.replace(/ voice=\S+/g,''));
 writePng(path.join(folder,'assets/test.png'),64,32,4,Buffer.alloc(64*32*4));const file=path.join(story,'tiles.json');const value=structuredClone(tiles);delete (value.tilesets.room as {rows?:number}).rows;await writeFile(file,JSON.stringify(value));
 const valid=await readStories('lantern',root);expect(valid.diagnostics.filter(d=>d.level==='error')).toEqual([]);expect((valid.resolvedTiles as typeof tiles).tilesets.room.rows).toBe(2);
 await writeFile(file,JSON.stringify({...value,legend:{...value.legend,Q:{tile:'room:8'}}}));expect((await readStories('lantern',root)).diagnostics.some(d=>d.code==='S047')).toBe(true);
 await writeFile(file,JSON.stringify({...value,legend:{...value.legend,s:{tile:'room:1'}}}));expect((await readStories('lantern',root)).diagnostics.some(d=>d.code==='S047')).toBe(true);
 await writeFile(file,JSON.stringify(value));await writeFile(path.join(story,'main.story.md'),baseline.replace(/ voice=\S+/g,'').replace('#..........#','#Q.........#'));expect((await readStories('lantern',root)).diagnostics.some(d=>d.code==='S020')).toBe(true);
});

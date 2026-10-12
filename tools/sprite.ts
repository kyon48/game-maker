import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { writePng } from './png';
export interface SpriteSpec { name?: string; eyes: string; hair: { style: 'messy_short'|'long_straight'|'bushy_curly'|'bob'|'bob_bangs'|'bun'|'shaggy_beard'; color: string }; accessories?: ('round_glasses'|'square_glasses'|'witch_hat'|'hairpin')[]; outfit: { cape: string; lining: string; tie: [string,string]; bottom: 'trousers'|'skirt'; vest?: string; coat?: string }; scale?: 0|1|2 }
const color = (hex: string) => { if (typeof hex !== 'string' || !/^#[a-f0-9]{6}$/i.test(hex)) throw new Error(`색은 #RRGGBB 형식입니다: ${hex}`); return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16),255]; };
export function parseSprite(value: unknown): SpriteSpec {
  const s=value as SpriteSpec;
  if (!s || !s.hair || !s.outfit || !['messy_short','long_straight','bushy_curly','bob','bob_bangs','bun','shaggy_beard'].includes(s.hair.style) || !['trousers','skirt'].includes(s.outfit.bottom) || !Array.isArray(s.outfit.tie) || s.outfit.tie.length !== 2 || s.scale !== undefined && ![0,1,2].includes(s.scale) || s.name !== undefined && typeof s.name !== 'string' || s.accessories !== undefined && (!Array.isArray(s.accessories)||s.accessories.some(a=>!['round_glasses','square_glasses','witch_hat','hairpin'].includes(a)))) throw new Error('스프라이트 spec 형식 오류');
  for (const hex of [s.eyes,s.hair.color,s.outfit.cape,s.outfit.lining,...s.outfit.tie,...[s.outfit.vest,s.outfit.coat].filter((s):s is string=>s!==undefined)]) color(hex);
  return s;
}
export function spritePixels(value: unknown): Buffer {
  const s=parseSprite(value), pixels=Buffer.alloc(48*96*4), outline=color('#342c39'), cream=color('#fff0d3'), hair=color(s.hair.color);
  for(let row=0;row<4;row++) for(let frame=0;frame<3;frame++) {
    const lift=s.scale??0, bob=frame===1?1:0;
    const rect=(x:number,y:number,w:number,h:number,c:readonly number[])=>{for(let yy=Math.max(0,y);yy<Math.min(24,y+h);yy++)for(let xx=Math.max(0,x);xx<Math.min(16,x+w);xx++)for(let k=0;k<4;k++)pixels[((row*24+yy)*48+frame*16+xx)*4+k]=c[k]!;};
    const edged=(x:number,y:number,w:number,h:number,c:readonly number[])=>{rect(x,y,w,h,outline);rect(x+1,y+1,w-2,h-2,c);};
    // Short legs remain at a shared ground line; height changes extend the torso/head.
    edged(4,20,3,frame===1?3:4,color('#55444d')); edged(9,20,3,frame===2?3:4,color('#55444d'));
    edged(3,12-lift+bob,10,9+lift-bob,color(s.outfit.coat??s.outfit.cape));
    if(row!==3) { rect(6,14-lift+bob,4,6+lift-bob,color(s.outfit.vest??s.outfit.lining)); rect(7,14-lift+bob,1,2,color(s.outfit.tie[0]));rect(8,16-lift+bob,1,2,color(s.outfit.tie[1])); }
    if(s.outfit.bottom==='skirt')edged(2,19,12,3,color(s.outfit.cape));
    edged(row===1?2:1,14+bob,3,4,cream);edged(row===2?11:12,14+bob,3,4,cream);
    edged(2,3-lift+bob,12,10,cream);rect(1,5-lift+bob,1,6,outline);rect(14,5-lift+bob,1,6,outline);
    const y=3-lift+bob; rect(3,y,10,2,hair);
    if(['bob','bob_bangs','long_straight','bushy_curly'].includes(s.hair.style)) {rect(2,y+2,2,s.hair.style==='long_straight'?12:7,hair);rect(12,y+2,2,s.hair.style==='long_straight'?12:7,hair);}
    if(s.hair.style==='messy_short'||s.hair.style==='bushy_curly') {rect(3,y-1,2,2,hair);rect(7,y-1,3,3,hair);rect(11,y-1,2,2,hair);}
    if(s.hair.style==='bob_bangs')rect(4,y+2,8,2,hair);
    if(s.hair.style==='bun')edged(row===1?11:row===2?1:6,y-2,4,3,hair);
    if(row===3)rect(3,y+2,10,7,hair);
    else { const eye=row===1?4:row===2?10:5;rect(eye,y+6,1,1,color(s.eyes));if(row===0)rect(10,y+6,1,1,color(s.eyes));rect(row===1?3:row===2?12:7,y+8,row===0?2:1,1,outline);
      if(s.hair.style==='shaggy_beard') {rect(4,y+8,8,3,hair);rect(6,y+11,4,1,hair);}
      if(s.accessories?.some(a=>a.endsWith('glasses'))) { const eyeglass=(x:number)=>{rect(x,y+4,5,1,outline);rect(x,y+7,5,1,outline);rect(x,y+5,1,2,outline);rect(x+4,y+5,1,2,outline);if(s.accessories?.includes('round_glasses')) {rect(x,y+4,1,1,cream);rect(x+4,y+4,1,1,cream);} };eyeglass(eye-1);if(row===0){eyeglass(9);rect(8,y+5,1,1,outline);}}
    }
    if(s.accessories?.includes('hairpin'))rect(row===2?3:11,y+2,2,1,color('#efb658'));
    if(s.accessories?.includes('witch_hat')){rect(1,y+1,14,2,outline);rect(3,y-1,10,2,color(s.outfit.cape));rect(5,y-2,6,2,outline);rect(7,y-3,2,2,outline);}
  }
  return pixels;
}
export async function writeSprite(value: unknown, output: string): Promise<void> {
  const s=parseSprite(value),pixels=spritePixels(s); writePng(output,48,96,4,pixels);
  const preview=Buffer.alloc(384*800*4);
  for(let i=0;i<preview.length;i+=4) {preview[i]=241;preview[i+1]=238;preview[i+2]=231;preview[i+3]=255;}
  for(let y=0;y<768;y++)for(let x=0;x<384;x++) {const source=(Math.floor(y/8)*48+Math.floor(x/8))*4;if(pixels[source+3])pixels.copy(preview,(y*384+x)*4,source,source+4);}
  const destination=output.replace(/\.png$/i,'.preview.png');
  if(!ffmpeg)throw Error('ffmpeg-static unavailable');
  const dir=await mkdtemp(path.join(tmpdir(),'sprite-preview-'));
  try { const source=path.join(dir,'sheet.png'),label=path.join(dir,'name.txt');writePng(source,384,800,4,preview);await import('node:fs/promises').then(fs=>fs.writeFile(label,s.name??path.basename(output,'.png')));const font=path.join(path.dirname(createRequire(import.meta.url).resolve('galmuri/package.json')),'dist/Galmuri11.ttf');await promisify(execFile)(ffmpeg,['-nostdin','-y','-loglevel','error','-i',source,'-vf',`drawtext=fontfile=${font}:textfile=${label}:fontsize=16:fontcolor=0x342c39:x=8:y=776`,'-frames:v','1',destination]); }
  finally {await rm(dir,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  try {const [spec,out]=process.argv.slice(2);if(!spec||!out||process.argv.length!==4||!out.endsWith('.png'))throw Error('Usage: sprite <spec.json> <out.png>');await writeSprite(JSON.parse(await readFile(spec,'utf8')),out);}catch(e){console.error(String(e));process.exitCode=1;}
}

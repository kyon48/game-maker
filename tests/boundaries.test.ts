import { expect, it } from 'vitest';
import ts from 'typescript';
import { ESLint } from 'eslint';
it('actual sim tsconfig rejects document in engine/sim',()=>{
  const config=ts.readConfigFile('tsconfig.sim.json',ts.sys.readFile);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,'.');
  const file=`${process.cwd()}/engine/sim/dom-probe.ts`;
  const host=ts.createCompilerHost(parsed.options),original=host.getSourceFile.bind(host);
  host.getSourceFile=(name,version,onError,shouldCreate)=>name===file
    ?ts.createSourceFile(name,'export const forbidden = document.title;',version,true):original(name,version,onError,shouldCreate);
  const errors=ts.getPreEmitDiagnostics(ts.createProgram([...parsed.fileNames,file],parsed.options,host));
  expect(errors.filter(error=>error.file?.fileName!==file)).toEqual([]);
  expect(errors.some(error=>error.code===2584 && ts.flattenDiagnosticMessageText(error.messageText,'\n').includes('document'))).toBe(true);
});
it('enforces imports and reexports across layers',async()=>{
  const eslint=new ESLint();
  const cases=[
    ['engine/sim/probe.ts',"import { thing } from '../platform/thing';",false],
    ['engine/sim/probe.ts',"import type { thing } from '../platform/thing';",false],
    ['engine/sim/probe.ts',"import { thing } from '@engine/api';",false],
    ['engine/sim/probe.ts',"import type { thing } from '@engine/api';",true],
    ['engine/sim/probe.ts',"import { thing } from './world/Camera';",true],
    ['engine/data/probe.ts',"export { thing } from '../sim/thing';",false],
    ['engine/api/probe.ts',"import { thing } from '../platform/thing';",false],
    ['packs/demo/plugins/probe.ts',"import { thing } from '../../../engine/sim/thing';",false],
    ['packs/demo/plugins/probe.ts',"import type { thing } from '@engine/api';",true],
    ['tools/probe.ts',"import { thing } from '../engine/platform/thing';",false],
    ['engine/sim/probe.ts',"import type { thing } from '../../tests/thing';",false],
    ['engine/sim/probe.ts',"void import('../platform/thing');",false],
    ['engine/sim/probe.ts',"import type { thing } from 'node:fs';",false],
    ['engine/data/probe.ts',"import type { thing } from '@engine/api';",true],
    ['engine/api/probe.ts',"export { thing } from '../sim/thing';",true],
  ] as const;
  for(const [filePath,code,allowed] of cases){
    const result=await eslint.lintText(code,{filePath});
    const errors=result.flatMap(result=>result.messages).filter(message=>message.ruleId==='architecture/boundary');
    expect(errors.length===0,`${filePath}: ${code}`).toBe(allowed);
  }
});

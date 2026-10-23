// SPDX-License-Identifier: MIT OR Apache-2.0
/** Freeze the existing installed-runtime creation/codec cases before their Rust replay. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {readDocument,writeDocument} from '../../../src/index';
import {generateAccessPackage} from '../../../src/compilation';
import {request,profile} from '../../../tests/compilation/access-fixtures';
const root=resolve(import.meta.dir,'../../..');
const output=resolve(root,'docs/helix/04-build/evidence/rust-migration/r3/stage-runtime-review');
try {await readFile(resolve(output,'frozen.json'));throw Error('Refusing to overwrite frozen runtime cases');}
catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const sha=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const cases:unknown[]=[];
for(const fixture of ['engine-only','containers','alternate-key']){
 const doc=readDocument(await Bun.file(resolve(root,'fixtures/access/commerce/'+(fixture==='alternate-key'?'engine-only':fixture)+'.json')).text(),'json');
 const order=doc.modules[0]!.elements.find(e=>e.id==='Order')!;
 if(fixture==='alternate-key')(order.keys as unknown[]).unshift({id:'alternate',name:'Alternate',fields:[{module:'commerce',element:'revision'}],primary:false});
 order.members=(order.members as {module:string;element:string}[]).filter(f=>f.element!=='placedAt');
 const access=doc.modules[0]!.extensions!['umf.access'] as unknown as {views:{record:{element:string};fields:{field:{element:string}}[]}[]};
 const view=access.views.find(v=>v.record.element==='Order')!;view.fields=view.fields.filter(f=>f.field.element!=='placedAt');
 const source=writeDocument(doc,'json');
 const q=request();q.sources[0]!.text=source;q.package='e2e_shop';
 if(fixture==='alternate-key')q.records.push({module:'commerce',element:'Customer'});
 q.names=[{sourceId:'logical',pointer:'/modules/0/elements/0',python:'order_id'}];
 if(fixture==='alternate-key')q.names.push({sourceId:'logical',pointer:'/modules/0/elements/6',python:'order_id'});
 const p=profile();p.python.version='3.11.17';p.dependencies=[{distribution:'umf_access',version:'0.1.0.dev0'},{distribution:'pydantic',version:'2.14.1'}];
 for(const invalid of [false,true]){
  const req=structuredClone(q);if(invalid)req.sources[0]!.text='{';
  const input={request:req,profile:p};let expected:unknown;
  try {expected={ok:true,result:generateAccessPackage(req,p)};}
  catch(error){const e=error as {code?:string;message?:string;pointer?:string};expected={ok:false,error:{code:e.code??'GENERATION_FAILED',message:e.message??String(error),...(e.pointer===undefined?{}:{pointer:e.pointer})}};}
  cases.push({id:fixture+(invalid?'-invalid-source':''),operation:'generateAccessPackage',request:input,expected,inputSha256:sha(JSON.stringify(input)),resultSha256:sha(JSON.stringify(expected))});
 }
}
await mkdir(output,{recursive:true});
const frozen=JSON.stringify({format:'umf-r3-stage-runtime-cases/1',cases},null,2)+'\n';
await writeFile(resolve(output,'frozen.json'),frozen);
const config={entrypoints:['scripts/rust-migration/r3/capture-stage-runtime.ts'],target:'bun' as const,write:false,metafile:true};
const build=await Bun.build(config);if(!build.success||!build.metafile)throw Error('No predecessor source closure');
const sources=[];for(const path of Object.keys(build.metafile.inputs).sort())sources.push({path,sha256:sha(await readFile(resolve(root,path)))});
await writeFile(resolve(output,'receipt.json'),JSON.stringify({scope:'Existing scripts/access-e2e.ts fixtures and pinned ABI/Pydantic profile; original TypeScript full result captured before Rust runtime replay, not publication/native support expansion',bun:Bun.version,fixtureSha256:sha(frozen),sourceFiles:sources},null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,fixtureSha256:sha(frozen)}));

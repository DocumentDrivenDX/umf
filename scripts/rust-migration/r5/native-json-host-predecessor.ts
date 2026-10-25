// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze JavaScript host-value behavior at the public parseNativeJson boundary.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseNativeJson} from '../../../src/model/native-json';

const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'../../..');
const output=resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-json-schema-tree-operations/native-json-host-predecessor.json');
const sha=async(path:string)=>createHash('sha256').update(await readFile(resolve(root,path))).digest('hex');
function outcome(value:unknown) {
  try { return {status:'returned',value:parseNativeJson(value as string)}; }
  catch(error) { const e=error as Error & {code?:string;path?:string};return {status:'threw',name:e.name,code:e.code??null,path:e.path??null,message:e.message}; }
}
const cases=[
  {id:'host.null',input:{type:'null'},value:null},
  {id:'host.number',input:{type:'number',value:7},value:7},
  {id:'host.boolean',input:{type:'boolean',value:true},value:true},
  {id:'host.array',input:{type:'array',value:['null']},value:['null']},
  {id:'host.plain-object',input:{type:'plain-object',value:{source:'null'}},value:{source:'null'}},
  {id:'host.string-object',input:{type:'string-object',value:'null'},value:new String('null')},
];
const packet={format:'umf-r5-native-json-host-typescript-predecessor/1',runtime:{bun:Bun.version},source:{path:'src/model/native-json.ts',sha256:await sha('src/model/native-json.ts')},captureScriptSha256:await sha('scripts/rust-migration/r5/native-json-host-predecessor.ts'),caseCount:cases.length,cases:cases.map(({id,input,value})=>({id,input,outcome:outcome(value)}))};
const body=JSON.stringify(packet,null,2)+'\n';
if(process.argv.includes('--check')) {if(await readFile(output,'utf8')!==body)throw new Error('Frozen host predecessor changed; review before refresh');}
else {await mkdir(dirname(output),{recursive:true});await writeFile(output,body);}
console.log(JSON.stringify({mode:process.argv.includes('--check')?'check':'write',output,caseCount:cases.length,packetSha256:createHash('sha256').update(body).digest('hex')}));

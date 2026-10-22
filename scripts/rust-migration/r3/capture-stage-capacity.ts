// SPDX-License-Identifier: MIT OR Apache-2.0
/** Immutable aggregate output controls: accepted output above 4M and refusal above 32MiB. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {generateAccessPackage} from '../../../src/compilation';
import type {AccessRequest,AccessProfile} from '../../../src/compilation/ir';
const root=resolve(import.meta.dir,'../../..'),out=resolve(root,'docs/helix/04-build/evidence/rust-migration/r3/stage-capacity-review');
try{await readFile(resolve(out,'frozen.json.gz'));throw Error('Refusing to overwrite frozen capacity controls');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const baseline=JSON.parse(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r3/baseline/stage-one.json'),'utf8'));
const base=baseline.vectors.find((row:{id:string})=>row.id==='candidate-base');
const cases=[];
for(const [size,outcome] of [[1_000_000,'candidate'],[3_000_000,'refused']] as const){
 const request:AccessRequest=structuredClone(base.request.request),profile:AccessProfile=structuredClone(base.request.profile);
 request.names=[{sourceId:request.logical,pointer:'/modules/0/elements/0',python:'f'+'a'.repeat(size)}];
 const result=generateAccessPackage(request,profile);
 if(result.outcome!==outcome)throw Error('Unexpected predecessor capacity outcome: '+size);
 const bytes=result.files.reduce((n,file)=>n+Buffer.byteLength(file.text),0);
 if(outcome==='candidate'&&!(bytes>4_000_000&&bytes<=33_554_432))throw Error('Accepted case does not exercise aggregate capacity');
 if(outcome==='refused'&&!result.diagnostics.some(d=>d.code==='LIMIT'))throw Error('Missing aggregate limit refusal');
 cases.push({id:'long-python-name-'+size,operation:'generateAccessPackage',request:{request,profile},expected:{ok:true,result},generatedUtf8Bytes:bytes});
}
await mkdir(out,{recursive:true});
const json=JSON.stringify({format:'umf-r3-stage-capacity-cases/1',cases})+'\n',compressed=gzipSync(json);
await writeFile(resolve(out,'frozen.json.gz'),compressed);
const config={entrypoints:['scripts/rust-migration/r3/capture-stage-capacity.ts'],target:'bun' as const,write:false,metafile:true};
const build=await Bun.build(config);if(!build.success||!build.metafile)throw Error('No source closure');
const sources=[];for(const path of Object.keys(build.metafile.inputs).sort())sources.push({path,sha256:sha(await readFile(resolve(root,path)))});
await writeFile(resolve(out,'receipt.json'),JSON.stringify({scope:'Exact complete TypeScript aggregate-output predecessor results; long valid Python field names without widening source parsing; no runtime identifier performance claim',bun:Bun.version,compressedSha256:sha(compressed),jsonSha256:sha(json),jsonBytes:Buffer.byteLength(json),cases:cases.map(row=>({id:row.id,outcome:row.expected.result.outcome,generatedUtf8Bytes:row.generatedUtf8Bytes})),sourceFiles:sources},null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,jsonBytes:Buffer.byteLength(json),compressedBytes:compressed.length,compressedSha256:sha(compressed)}));

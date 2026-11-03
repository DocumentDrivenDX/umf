// SPDX-License-Identifier: MIT OR Apache-2.0
/** @covers US-093-AC1 @covers US-093-AC2 */
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {encodeRequestWire,fromWire} from '../bindings/core/node/src/wire.js';
const root=resolve(import.meta.dir,'..'),pkg=process.env.UMF_KIND_NODE_PACKAGE,cli=process.env.UMF_KIND_CLI;
if(!pkg||!cli||resolve(pkg).startsWith(root+'/'))throw Error('Set an installed UMF_KIND_NODE_PACKAGE outside the checkout and UMF_KIND_CLI');
const resources={coreSchema:await Bun.file('spec/core/schema.json').json(),referenceSchema:await Bun.file('spec/core/semantic-type-reference.schema.json').json(),packageSchema:await Bun.file('spec/core/extension-package.schema.json').json(),constraints:await Bun.file('spec/metamodel/generated/core-constraints.json').json(),domainPolicy:await Bun.file('spec/metamodel/generated/domain-policy.json').json()};
const registry=[{manifest:await Bun.file('spec/extensions/lakeview/package.json').json(),kinds:true,nativeValidator:'lakeview/0.2.0'}];
const hash=(b:Uint8Array|string)=>createHash('sha256').update(b).digest('hex');
const inputs=['crates/umf-core/src/lakeview.rs','crates/umf-core/src/constraints.rs','crates/umf-core/src/serialization.rs','crates/umf-core-wire/src/lib.rs','bindings/core/node/index.js','spec/extensions/lakeview/package.json','spec/metamodel/generated/manifest.json','scripts/lakeview-native-conformance.ts','scripts/lakeview-installed.mjs'];
const snapshot=async()=>Object.fromEntries(await Promise.all(inputs.map(async p=>[p,hash(await Bun.file(p).bytes())])));
const before=await snapshot();
async function command(program:string,args:string[],stdin?:string,emptyPath=false){
 const child=Bun.spawn([program,...args],{cwd:emptyPath?'/tmp':root,env:emptyPath?{PATH:''}:process.env,stdin:stdin===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});
 const out=new Response(child.stdout).text(),error=new Response(child.stderr).text();
 if(stdin!==undefined){const sink=child.stdin;if(!sink||typeof sink==='number')throw Error('CLI stdin pipe is required');sink.write(stdin);await sink.end()}
 const [stdout,stderr,code]=await Promise.all([out,error,child.exited]);if(code)throw Error(stderr);return JSON.parse(stdout.trim());
}
async function request(op:string,args:any){const r=await command(cli!,['core','--stdin-wire'],encodeRequestWire({op,resources,registry,...args})+'\n',true);if(r.status!=='ok')throw Error(JSON.stringify(r));return fromWire(JSON.parse(r.wire)) as any;}
const node=await command(process.env.NODE??'node',['scripts/lakeview-installed.mjs',pkg,root]);
const bun=await command(process.execPath,['scripts/lakeview-installed.mjs',pkg,root]);
const native=[];
for(const name of ['marketing-campaign','lexical-quirks','empty-sections']){
 const original=await Bun.file('fixtures/lakeview/'+name+'.lvdash.json').bytes();
 const source=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(original);
 const {document}=await request('lakeview-import',{source,options:{id:'installed-dashboard'}});
 const inspection=await request('inspect-kinds',{document});
 if(!inspection.sourceValidation.valid||inspection.entries[0]?.reference.kind!=='dashboard')throw Error('CLI discovery failed '+name);
 const recoveries=[];
 for(const format of ['direct','json','yaml']){
  let restored=document;
  if(format!=='direct'){const written=await request('write',{document,format});restored=(await request('read',{source:written.source,format})).document;}
  const bytes=new TextEncoder().encode(await request('lakeview-export',{document:restored}));
  if(bytes.length!==original.length||bytes.some((v,i)=>v!==original[i]))throw Error('CLI original bytes differ '+name+'/'+format);
  recoveries.push({format,sha256:hash(bytes)});
 }
 native.push({name,bytes:original.length,original:hash(original),recoveries,entries:inspection.entries.length});
}
for(const host of [node.results,bun.results])if(JSON.stringify(host)!==JSON.stringify(native))throw Error('Installed Lakeview host parity differs');
if(JSON.stringify(before)!==JSON.stringify(await snapshot()))throw Error('Source changed during native Lakeview qualification');
const receipt={profile:'umf.lakeview.installed-original-bytes/1',hosts:['installed Node package','installed Bun package','native CLI with empty PATH'],results:native,mismatches:0,sources:before,artifacts:{node:hash(await Bun.file(resolve(pkg,'umf_core_node.node')).bytes()),cli:hash(await Bun.file(cli).bytes())},limits:'Committed originals only; native Rust serializers in both UMF JSON/YAML paths; no Databricks acceptance or edited-source rewrite qualification.'};
await Bun.write('docs/helix/04-build/evidence/lakeview/installed.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));

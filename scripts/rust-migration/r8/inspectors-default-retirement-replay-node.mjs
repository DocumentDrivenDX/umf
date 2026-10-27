// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay frozen Inspector packets through installed Node/Bun default and reference routes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd(),archive=resolve(process.env.UMF_R8_INSPECTOR_ARCHIVE_ROOT??''),out=resolve(process.env.UMF_R8_INSPECTOR_RECEIPT_DIR??'');
const archiveSha256=process.env.UMF_R8_INSPECTOR_ARCHIVE_SHA256,sourceClosureSha256=process.env.UMF_R8_INSPECTOR_SOURCE_CLOSURE_SHA256;
if(!process.env.UMF_R8_INSPECTOR_ARCHIVE_ROOT||!process.env.UMF_R8_INSPECTOR_RECEIPT_DIR||!archiveSha256||!sourceClosureSha256)throw new Error('Archive root, receipt directory and source pins are required');
const evidence='docs/helix/04-build/evidence/rust-migration/r8-inspectors-default-retirement-replay';
const names=['inspectCoreScalarType','inspectCoreRecordMembers','inspectCoreReferenceLinks'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const canonical=value=>JSON.stringify(stable(value));
const packets=Object.fromEntries(await Promise.all(names.map(async name=>[name,JSON.parse(await readFile(join(root,evidence,`${name}.packet.json`),'utf8'))])));
const addon=createRequire(import.meta.url)(join(archive,'dist/umf_core_node.node'));
const original=addon.executeRequestWire;
if(typeof original!=='function')throw new Error('Installed native addon has no executeRequestWire entry');
let rustCalls=0;addon.executeRequestWire=function(...args){rustCalls++;return original.apply(this,args);};
const defaults=await import(pathToFileURL(join(archive,'dist/umf-node.js')).href);
const reference=await import(pathToFileURL(join(archive,'dist/umf.js')).href);
const runtime=process.versions.bun?`Bun ${Bun.version}`:`Node ${process.version}`;
function argsFor(input,trace){
 const source=structuredClone(input.source),identity=structuredClone(input.identity);
 if(input.profile==='accessor_source')Object.defineProperty(source,'probe',{enumerable:true,get(){trace.push('accessor:probe');return null;}});
 if(input.profile==='accessor_identity')Object.defineProperty(identity,'module',{enumerable:true,get(){trace.push('accessor:module');return null;}});
 return [source,identity];
}
function outcome(run){try{return stable({status:'returned',value:run()});}catch(error){const e=error;return {status:'threw',name:String(e?.name??''),code:typeof e?.code==='string'?e.code:null,path:typeof e?.path==='string'?e.path:null,message:String(e?.message??'')};}}
await mkdir(out,{recursive:true});
for(const name of names){
 const packet=packets[name],cases=[];let defaultEntry,referenceEntry,addonBytes;
 rustCalls=0;
 for(const item of packet.cases){
  const defaultTrace=[];rustCalls=0;const defaultOutcome=outcome(()=>defaults[name](...argsFor(item.input,defaultTrace))),defaultCalls=rustCalls;
  assert.equal(canonical(defaultOutcome),canonical(item.expectedOutcome),`${name}/${item.id} default outcome`);
  assert.equal(canonical(defaultTrace),canonical(item.expectedTrace),`${name}/${item.id} default accessor trace`);
  const refTrace=[];rustCalls=0;const referenceOutcome=outcome(()=>reference[name](...argsFor(item.input,refTrace))),referenceCalls=rustCalls;
  assert.equal(canonical(referenceOutcome),canonical(item.expectedOutcome),`${name}/${item.id} reference outcome`);
  assert.equal(canonical(refTrace),canonical(item.expectedTrace),`${name}/${item.id} reference accessor trace`);
  assert.equal(referenceCalls,0,`${name}/${item.id} reference invoked native addon`);
  assert.equal(item.expectsRust?defaultCalls>0:defaultCalls===0,true,`${name}/${item.id} Rust invocation count`);
  cases.push({id:item.id,defaultOutcome,defaultTrace,defaultRustCalls:defaultCalls,referenceOutcome,referenceTrace:refTrace,referenceRustCalls:referenceCalls});
 }
 defaultEntry=await readFile(join(archive,'dist/umf-node.js'));referenceEntry=await readFile(join(archive,'dist/umf.js'));addonBytes=await readFile(join(archive,'dist/umf_core_node.node'));
 const packetBytes=await readFile(join(root,evidence,`${name}.packet.json`));
 const receipt={format:'umf.r8.default-route-retirement-host-receipt/1',status:'pass',runtime:process.versions.bun?'bun':'node',hostVersion:process.versions.bun?Bun.version:process.version,archiveSha256,sourceClosureSha256,packetSha256:hash(packetBytes),defaultRoute:{routeId:'package-root-node',entryMember:'dist/umf-node.js',entrySha256:hash(defaultEntry),artifactMembers:[{path:'dist/umf_core_node.node',sha256:hash(addonBytes)}]},referenceRoute:{routeId:'package-reference',entryMember:'dist/umf.js',entrySha256:hash(referenceEntry),artifactMembers:[]},cases};
 await writeFile(join(out,`${name}-${process.versions.bun?'bun':'node'}.json`),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({exportName:name,runtime,caseCount:cases.length,defaultRustCalls:cases.map(item=>item.defaultRustCalls),packetSha256:receipt.packetSha256}));
}

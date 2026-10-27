// SPDX-License-Identifier: MIT OR Apache-2.0
// Replay frozen operation packets through the installed Node package routes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=process.cwd();
const archive=resolve(process.env.UMF_R8_RETIREMENT_ARCHIVE_ROOT??'');
const out=resolve(process.env.UMF_R8_RETIREMENT_RECEIPT_DIR??'');
if(!process.env.UMF_R8_RETIREMENT_ARCHIVE_ROOT||!process.env.UMF_R8_RETIREMENT_RECEIPT_DIR)throw new Error('Archive root and receipt directory are required');
const evidence='docs/helix/04-build/evidence/rust-migration/r8-relationships-default-retirement-replay';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const canonical=value=>JSON.stringify(stable(value));
const archiveSha256=process.env.UMF_R8_RETIREMENT_ARCHIVE_SHA256;
const sourceClosureSha256=process.env.UMF_R8_RETIREMENT_SOURCE_CLOSURE_SHA256;
if(!archiveSha256||!sourceClosureSha256)throw new Error('Archive and source-closure pins are required');
const require=createRequire(import.meta.url);
const addon=require(join(archive,'dist/umf_core_node.node'));
const original=addon.executeRequestWire;
if(typeof original!=='function')throw new Error('Installed native addon has no executeRequestWire entry');
let rustCalls=0;
addon.executeRequestWire=function(...args){rustCalls++;return original.apply(this,args);};

const defaultEntry=join(archive,'dist/umf-node.js');
const referenceEntry=join(archive,'dist/umf.js');
const defaults=await import(pathToFileURL(defaultEntry).href);
const reference=await import(pathToFileURL(referenceEntry).href);
const packetNames=['inspectCoreRelationships','lookupCoreRelationship','declareCoreRelationship','verifyCoreRelationshipOperation'];
const operations={inspectCoreRelationships:defaults.inspectCoreRelationships,lookupCoreRelationship:defaults.lookupCoreRelationship,declareCoreRelationship:defaults.declareCoreRelationship,verifyCoreRelationshipOperation:defaults.verifyCoreRelationshipOperation};
const referenceOperations={inspectCoreRelationships:reference.inspectCoreRelationships,lookupCoreRelationship:reference.lookupCoreRelationship,declareCoreRelationship:reference.declareCoreRelationship,verifyCoreRelationshipOperation:reference.verifyCoreRelationshipOperation};
function watched(value,label,trace){return new Proxy(value,{getPrototypeOf(t){trace.push(`${label}:getPrototypeOf`);return Reflect.getPrototypeOf(t);},ownKeys(t){trace.push(`${label}:ownKeys`);return Reflect.ownKeys(t);},getOwnPropertyDescriptor(t,k){trace.push(`${label}:descriptor:${String(k)}`);return Reflect.getOwnPropertyDescriptor(t,k);},get(t,k,r){trace.push(`${label}:get:${String(k)}`);return Reflect.get(t,k,r);}});}
function accessor(value,key,trace){const cloned=structuredClone(value);Object.defineProperty(cloned,key,{enumerable:true,get(){trace.push(`accessor:${key}`);return null;}});return cloned;}
function argsFor(input,trace){
 switch(input.profile){
  case 'source-accessor':return [accessor(input.source,'umf',trace),watched(input.identity,'identity',trace)];
  case 'identity-accessor':return [watched(input.source,'source',trace),accessor(input.identity,'id',trace)];
  case 'request-accessor':return [watched(input.source,'source',trace),watched(input.identity,'identity',trace),accessor(input.request,'name',trace)];
  case 'receipt-accessor':return [accessor(input.receipt,'version',trace),watched(input.current,'current',trace)];
  default:return input.receipt?[input.receipt,input.current]:input.request?[input.source,input.identity,input.request]:input.identity?.id?[input.source,input.identity]:[input.source,input.identity];
 }
}
function outcome(run){try{return {status:'returned',value:run()};}catch(e){return {status:'threw',name:String(e?.name??''),code:typeof e?.code==='string'?e.code:null,path:typeof e?.path==='string'?e.path:null,message:String(e?.message??'')};}}
const runtime=process.versions.bun?`Bun ${Bun.version}`:`Node ${process.version}`;
for(const exportName of packetNames){
 const packetPath=join(root,evidence,`${exportName}.packet.json`);
 const packetBytes=await readFile(packetPath),packet=JSON.parse(packetBytes);
 const defaultCases=[],referenceCases=[];
 for(const item of packet.cases){
  const trace=[];rustCalls=0;
  const defaultOutcome=stable(outcome(()=>operations[exportName](...argsFor(item.input,trace))));
  const defaultCalls=rustCalls;
  assert.equal(canonical(defaultOutcome),canonical(item.expectedOutcome),`${exportName}/${item.id} default outcome`);
  assert.equal(canonical(trace),canonical(item.expectedTrace),`${exportName}/${item.id} default trace`);
  const refTrace=[];rustCalls=0;
  const referenceOutcome=stable(outcome(()=>referenceOperations[exportName](...argsFor(item.input,refTrace))));
  const referenceCalls=rustCalls;
  assert.equal(canonical(referenceOutcome),canonical(item.expectedOutcome),`${exportName}/${item.id} reference outcome`);
  assert.equal(canonical(refTrace),canonical(item.expectedTrace),`${exportName}/${item.id} reference trace`);
  assert.equal(referenceCalls,0,`${exportName}/${item.id} reference route invoked native addon`);
  assert.equal(item.expectsRust?defaultCalls>0:defaultCalls===0,true,`${exportName}/${item.id} Rust invocation count`);
  defaultCases.push({id:item.id,defaultOutcome,defaultTrace:trace,defaultRustCalls:defaultCalls,referenceOutcome,referenceTrace:refTrace,referenceRustCalls:referenceCalls});
 }
 const nodeEntryBytes=await readFile(defaultEntry),referenceBytes=await readFile(referenceEntry),addonBytes=await readFile(join(archive,'dist/umf_core_node.node'));
 const receipt={format:'umf.r8.default-route-retirement-host-receipt/1',status:'pass',runtime:process.versions.bun?'bun':'node',hostVersion:process.versions.bun?Bun.version:process.version,archiveSha256,sourceClosureSha256,packetSha256:hash(packetBytes),defaultRoute:{routeId:'package-root-node',entryMember:'dist/umf-node.js',entrySha256:hash(nodeEntryBytes),artifactMembers:[{path:'dist/umf_core_node.node',sha256:hash(addonBytes)}]},referenceRoute:{routeId:'package-reference',entryMember:'dist/umf.js',entrySha256:hash(referenceBytes),artifactMembers:[]},cases:defaultCases};
 await writeFile(join(out,`${exportName}-${process.versions.bun?'bun':'node'}.json`),`${JSON.stringify(receipt,null,2)}\n`);
 console.log(JSON.stringify({exportName,runtime,caseCount:defaultCases.length,defaultRustCalls:defaultCases.map(c=>c.defaultRustCalls),packetSha256:receipt.packetSha256}));
}

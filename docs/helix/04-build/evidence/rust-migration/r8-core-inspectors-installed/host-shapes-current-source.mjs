// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed host-shape comparison for the three default core inspectors.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';

const archive = resolve(process.argv[2] ?? '');
const expectedArchiveSha = process.argv[3];
const expectedClosureSha = process.argv[4];
if (!archive || !expectedArchiveSha || !expectedClosureSha) throw new Error('Usage: bun host-shapes-current-source.mjs <umf-sdk.tgz> <archive-sha256> <source-closure-sha256>');
const frozenPath = resolve('docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const temp = join(tmpdir(), `umf-r8-inspector-host-shapes-${process.pid}-${Date.now()}`);
const packageRoot = join(temp, 'node_modules/@umf/core');
const probe = `
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as root from '@umf/core';
import * as reference from '@umf/core/reference';
const frozen=JSON.parse(await readFile(${JSON.stringify(frozenPath)},'utf8'));
const operations={scalarType:'inspectCoreScalarType',recordMembers:'inspectCoreRecordMembers',referenceLinks:'inspectCoreReferenceLinks'};
const cases={
 accessor_source:{code:'NON_JSON',message:'Hidden fields and accessors cannot be serialized faithfully',path:'/probe'},
 accessor_identity:{code:'NON_JSON',message:'Hidden fields and accessors cannot be serialized faithfully',path:'/module'},
 hidden_source:{code:'NON_JSON',message:'Hidden fields and accessors cannot be serialized faithfully',path:'/probe'},
 symbol_source:{code:'NON_JSON',message:'Symbol keys are not JSON-compatible',path:''},
};
const forgedError={name:'AdmissionError',code:'ACCESSOR_PROPERTY',path:'/source/probe',message:'caller-controlled proxy failure'};
const canon=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const capture=(fn,source,identity)=>{try{return{ok:true,value:fn(source,identity)}}catch(error){return{ok:false,error:{name:error.name,code:error.code??null,path:error.path??'',message:error.message??String(error)}}}};
const compare=(fn,makeSource,makeIdentity)=>{
 const observations={};
 for(const [route,routeFn] of [['default',fn.default],['reference',fn.reference]]){
  const events=[];const source=makeSource(events);const identity=makeIdentity(events);
  const result=capture(routeFn,source,identity);
  observations[route]={...result,events};
 }
 return observations;
};
const makeProbe=(packetName,shape,events)=>{
 const base=frozen.packets[packetName].packet.cases.known_uuid??frozen.packets[packetName].packet.cases.known;
 const source=structuredClone(base.source),identity=structuredClone(base.identity);
 if(shape==='accessor_source')Object.defineProperty(source,'probe',{enumerable:true,configurable:true,get(){events.push('source.get:probe');return 1}});
 else if(shape==='accessor_identity')Object.defineProperty(identity,'module',{enumerable:true,configurable:true,get(){events.push('identity.get:module');return base.identity.module}});
 else if(shape==='hidden_source')Object.defineProperty(source,'probe',{enumerable:false,configurable:true,value:1});
 else if(shape==='symbol_source')source[Symbol('probe')]=1;
 return {source,identity};
};
const shapeRows={};
for(const [packetName,operation] of Object.entries(operations)){
 const packet=frozen.packets[packetName].packet,base=packet.cases.known_uuid??packet.cases.known;
 shapeRows[packetName]={};
 for(const [shape,expected] of Object.entries(cases)){
  const make=events=>makeProbe(packetName,shape,events);
  const observation=compare({default:root[operation],reference:reference[operation]},events=>make(events).source,events=>make(events).identity);
  for(const route of ['default','reference']){
   const actual=observation[route];
   assert.deepEqual(actual,{ok:false,error:{name:'UmfError',...expected},events:[]},operation+' '+shape+' '+route+' exact error envelope and no getter call');
  }
  shapeRows[packetName][shape]=observation;
 }
  const forged={};
  for(const [route,api] of [['default',root],['reference',reference]]){
   const events=[],base=packet.cases.known_uuid??packet.cases.known;
   const source=new Proxy(structuredClone(base.source),{getPrototypeOf(){events.push('source.getPrototypeOf');throw Object.assign(new Error(forgedError.message),{name:forgedError.name,code:forgedError.code,path:forgedError.path})}});
   const result=capture(api[operation],source,structuredClone(base.identity));
   assert.deepEqual(events,['source.getPrototypeOf'],operation+' '+route+' forged proxy is observed once');
   forged[route]={...result,events};
  }
  forged.parity=canon(forged.default)===canon(forged.reference);
  shapeRows[packetName].forged_proxy_source=forged;
}
const scalarBase=frozen.packets.scalarType.packet.cases.known_uuid;
const proxy=compare({default:root.inspectCoreScalarType,reference:reference.inspectCoreScalarType},events=>new Proxy(structuredClone(scalarBase.source),{
 getPrototypeOf(target){events.push('source.getPrototypeOf');return Reflect.getPrototypeOf(target)},
 ownKeys(target){events.push('source.ownKeys');return Reflect.ownKeys(target)},
 getOwnPropertyDescriptor(target,key){events.push('source.descriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(target,key)},
 get(target,key,receiver){events.push('source.get:'+String(key));return Reflect.get(target,key,receiver)},
}),()=>structuredClone(scalarBase.identity));
const proxyEvents=['source.getPrototypeOf','source.ownKeys','source.ownKeys','source.descriptor:umf','source.descriptor:id','source.descriptor:vocabularies','source.descriptor:modules'];
for(const route of ['default','reference']){
 assert.equal(proxy[route].ok,true,'proxy source remains accepted on '+route);
 assert.deepEqual(proxy[route].events,proxyEvents,'proxy source trap sequence on '+route);
}
assert.equal(canon(proxy.default.value),canon(proxy.reference.value),'proxy successful output parity');
const copySource=structuredClone(scalarBase.source),copyIdentity=structuredClone(scalarBase.identity);
const copyResult=root.inspectCoreScalarType(copySource,copyIdentity);
const originalResult=canon(copyResult);
copySource.modules[0].elements[0].scalarType='mutated-after-call';
assert.equal(canon(copyResult),originalResult,'returned snapshot is detached from later input mutation');
copyResult.source.modules[0].elements[0].scalarType='mutated-result';
assert.equal(copySource.modules[0].elements[0].scalarType,'mutated-after-call','returned snapshot mutation does not reach input');
console.log(JSON.stringify({runtime:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,hostShapes:shapeRows,proxySource:proxy,copyIsolation:{inputMutationDoesNotChangeResult:true,resultMutationDoesNotChangeInput:true},publicControls:{rootExportsControls:Object.keys(root).filter(name=>/Engine|Wasm|meter|Control/i.test(name))}}));
`;
const run = async (command, args) => {
 const child = Bun.spawn([command, ...args], {cwd: temp, stdout:'pipe', stderr:'pipe'});
 const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
 const code = await child.exited;
 assert.equal(code, 0, `${command} failed (${code})\n${stdout}\n${stderr}`);
 return JSON.parse(stdout.trim());
};
try {
 const archiveBytes = await readFile(archive);
 assert.equal(sha(archiveBytes), expectedArchiveSha, 'pinned archive hash');
 await mkdir(packageRoot, {recursive:true});
 const tar = Bun.spawn(['tar','-xzf',archive,'--strip-components=1','-C',packageRoot], {stdout:'pipe',stderr:'pipe'});
 const [tarOut,tarErr] = await Promise.all([new Response(tar.stdout).text(),new Response(tar.stderr).text()]);
 assert.equal(await tar.exited,0,`archive extraction failed\n${tarOut}\n${tarErr}`);
 const manifest = JSON.parse(await readFile(join(packageRoot,'manifest.json'),'utf8'));
 const sdk = JSON.parse(await readFile(join(packageRoot,'dist/rust-default-manifest.json'),'utf8'));
 assert.equal(manifest.sourceTreeSha256,expectedClosureSha,'pinned current source closure');
 assert.equal(manifest.capturedLiveSourceTreeSha256,expectedClosureSha,'captured live source closure');
 assert.equal(sdk.sourceClosure.sha256,expectedClosureSha,'SDK source closure');
 for (const [path,digest] of Object.entries(manifest.sha256)) assert.equal(sha(await readFile(join(packageRoot,path))),digest,`archive member ${path}`);
 await writeFile(join(temp,'host-shape-probe.mjs'),probe);
 const [node,bun] = await Promise.all([run('node',['host-shape-probe.mjs']),run('bun',['host-shape-probe.mjs'])]);
 const receipt={format:'umf.r8.core-inspectors-host-shapes-current/1',status:'observed',archive:{path:archive,sha256:sha(archiveBytes),sourceClosureSha256:expectedClosureSha,verifiedMemberCount:Object.keys(manifest.sha256).length},harnessSha256:sha(await readFile(new URL(import.meta.url))),predecessorSha256:sha(await readFile(frozenPath)),runtime:{node,bun},qualification:'Four host refusals and one adversarial forged-error proxy per inspector across installed Node/Bun default and reference routes, plus scalar-inspector proxy/copy observations. Browser host-shape parity and inspector retirement are not established.'};
 console.log(JSON.stringify(receipt,null,2));
} finally { await rm(temp,{recursive:true,force:true}); }

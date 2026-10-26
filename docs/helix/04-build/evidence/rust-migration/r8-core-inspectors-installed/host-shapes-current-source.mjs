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
const base=frozen.packets.scalarType.packet.cases.known_uuid;
const canon=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const capture=(fn,source,identity)=>{try{return{ok:true,value:fn(source,identity)}}catch(error){return{ok:false,error:{name:error.name,code:error.code??null,path:error.path??'',message:error.message??String(error)}}}};
const compare=(name,makeSource,makeIdentity=()=>structuredClone(base.identity))=>{
 const observations={};
 for(const [route,fn] of [['default',root.inspectCoreScalarType],['reference',reference.inspectCoreScalarType]]){
  const events=[];const source=makeSource(events);const identity=makeIdentity(events);
  const result=capture(fn,source,identity);
  observations[route]={...result,events};
 }
 return observations;
};
const accessorSource=(events)=>{const source=structuredClone(base.source);Object.defineProperty(source,'probe',{enumerable:true,configurable:true,get(){events.push('source.get:probe');return 1}});return source};
const accessorIdentity=events=>{const identity={element:base.identity.element};Object.defineProperty(identity,'module',{enumerable:true,configurable:true,get(){events.push('identity.get:module');return base.identity.module}});return identity};
const hiddenSource=()=>{const source=structuredClone(base.source);Object.defineProperty(source,'probe',{enumerable:false,configurable:true,value:1});return source};
const symbolSource=()=>{const source=structuredClone(base.source);source[Symbol('probe')]=1;return source};
const proxySource=events=>new Proxy(structuredClone(base.source),{
 getPrototypeOf(target){events.push('source.getPrototypeOf');return Reflect.getPrototypeOf(target)},
 ownKeys(target){events.push('source.ownKeys');return Reflect.ownKeys(target)},
 getOwnPropertyDescriptor(target,key){events.push('source.descriptor:'+String(key));return Reflect.getOwnPropertyDescriptor(target,key)},
 get(target,key,receiver){events.push('source.get:'+String(key));return Reflect.get(target,key,receiver)},
});
const rows={accessor_source:compare('accessor_source',accessorSource),accessor_identity:compare('accessor_identity',()=>structuredClone(base.source),accessorIdentity),hidden_source:compare('hidden_source',hiddenSource),symbol_source:compare('symbol_source',symbolSource),proxy_source:compare('proxy_source',proxySource)};
for(const [name,observation] of Object.entries(rows)){
 const a=observation.default,b=observation.reference;
 if(a.ok&&b.ok) assert.equal(canon(a.value),canon(b.value),name+' successful output');
}
const copySource=structuredClone(base.source),copyIdentity=structuredClone(base.identity);
const copyResult=root.inspectCoreScalarType(copySource,copyIdentity);
const originalResult=canon(copyResult);
copySource.modules[0].elements[0].scalarType='mutated-after-call';
assert.equal(canon(copyResult),originalResult,'returned snapshot is detached from later input mutation');
copyResult.source.modules[0].elements[0].scalarType='mutated-result';
assert.equal(copySource.modules[0].elements[0].scalarType,'mutated-after-call','returned snapshot mutation does not reach input');
console.log(JSON.stringify({runtime:typeof Bun==='undefined'?'Node '+process.version:'Bun '+Bun.version,rows,copyIsolation:{inputMutationDoesNotChangeResult:true,resultMutationDoesNotChangeInput:true},publicControls:{rootExportsControls:Object.keys(root).filter(name=>/Engine|Wasm|meter|Control/i.test(name))}}));
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
 const receipt={format:'umf.r8.core-inspectors-host-shapes-current/1',status:'observed',archive:{path:archive,sha256:sha(archiveBytes),sourceClosureSha256:expectedClosureSha,verifiedMemberCount:Object.keys(manifest.sha256).length},harnessSha256:sha(await readFile(new URL(import.meta.url))),predecessorSha256:sha(await readFile(frozenPath)),runtime:{node,bun},qualification:'Selected installed Node/Bun host-shape probes for inspectCoreScalarType only. Observations do not establish browser host-shape parity or inspector retirement.'};
 console.log(JSON.stringify(receipt,null,2));
} finally { await rm(temp,{recursive:true,force:true}); }

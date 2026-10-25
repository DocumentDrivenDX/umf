// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare all three default Node routes against their frozen R5 predecessor packets.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectCoreScalarType,inspectCoreRecordMembers,inspectCoreReferenceLinks} from '../../../src/index-node-v4';
import {inspectCoreScalarType as predecessorScalar} from '../../../src/model/scalar-type';
import {inspectCoreRecordMembers as predecessorMembers} from '../../../src/model/record-members';
import {inspectCoreReferenceLinks as predecessorLinks} from '../../../src/model/reference-links';
import {UmfError} from '../../../src/model/errors';
import {bindCoreInspectorsRust} from '../../../src/access/rust-core-inspectors-default';
import frozen from '../../../docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json' with {type:'json'};
const operations={scalarType:inspectCoreScalarType,recordMembers:inspectCoreRecordMembers,referenceLinks:inspectCoreReferenceLinks} as const;
const predecessors={scalarType:predecessorScalar,recordMembers:predecessorMembers,referenceLinks:predecessorLinks} as const;
const binderSource=await readFile('src/access/rust-core-inspectors-default.ts','utf8');
assert.doesNotMatch(binderSource,/model\/json|copyJson/,'default binder must not depend on TypeScript JSON copying');
const passSource={umf:'0.10.0'},passIdentity={module:'m',element:'f'},forwarded:any[]=[];
const proxy=bindCoreInspectorsRust({
 inspectCoreScalarType(source:unknown,identity:unknown){forwarded.push([source,identity]);return source;},
 inspectCoreRecordMembers(source:unknown,identity:unknown){forwarded.push([source,identity]);return source;},
 inspectCoreReferenceLinks(source:unknown,identity:unknown){forwarded.push([source,identity]);return source;},
} as never);
for(const name of ['inspectCoreScalarType','inspectCoreRecordMembers','inspectCoreReferenceLinks'] as const)assert.equal(proxy[name](passSource as never,passIdentity as never),passSource);
assert.ok(forwarded.every(([source,identity])=>source===passSource&&identity===passIdentity),'binder forwards original input references to native admission');
for(const [group,operation] of Object.entries(operations)){
 const packet=frozen.packets[group as keyof typeof frozen.packets].packet as unknown as {cases:Record<string,{source:unknown;identity:unknown}>;outcomes:Record<string,unknown>};
 for(const [name,{source,identity}] of Object.entries(packet.cases)){
  let actual;
  try{actual={ok:true,value:operation(source as never,identity as never)};}
  catch(error){const e=error as {code?:string;message?:string;path?:string};actual={ok:false,error:{code:e.code??'',message:e.message??String(error),path:e.path??''}};}
  assert.equal(JSON.stringify(actual),JSON.stringify(packet.outcomes[name]),`${group}/${name}`);
 }
 const successName=Object.keys(packet.outcomes).find(name=>packet.outcomes[name]&&typeof packet.outcomes[name]==='object'&&(packet.outcomes[name] as {ok?:boolean}).ok)!,failureName=Object.keys(packet.outcomes).find(name=>packet.outcomes[name]&&typeof packet.outcomes[name]==='object'&&(packet.outcomes[name] as {ok?:boolean}).ok===false)!;
 const success=packet.cases[successName]!,failure=packet.cases[failureName]!,predecessor=predecessors[group as keyof typeof predecessors];
 assert.deepEqual(operation(success.source as never,success.identity as never),predecessor(success.source as never,success.identity as never),`${group} same-runtime success parity`);
 const capture=(fn:()=>unknown)=>{let caught:unknown;try{fn()}catch(error){caught=error}assert.ok(caught,'expected refusal');return caught as Error&{code?:string;path?:string}};
 const rustError=capture(()=>operation(failure.source as never,failure.identity as never)),tsError=capture(()=>predecessor(failure.source as never,failure.identity as never));
 assert.equal(rustError.name,tsError.name,`${group} error name`);assert.equal(Object.getPrototypeOf(rustError),Object.getPrototypeOf(tsError),`${group} error prototype`);assert.equal(rustError instanceof UmfError,tsError instanceof UmfError,`${group} UmfError identity`);assert.equal(JSON.stringify({code:rustError.code,message:rustError.message,path:rustError.path??''}),JSON.stringify({code:tsError.code,message:tsError.message,path:tsError.path??''}),`${group} full error parity`);
 const isolated=structuredClone(success.source) as {id:string};const isolatedResult=operation(isolated as never,success.identity as never) as {source:Record<string,unknown>};isolatedResult.source.id='caller-mutated';assert.notEqual(isolated.id,'caller-mutated',`${group} result source is copied`);
 console.log(`${group}: ${Object.keys(packet.cases).length} exact matches`);
}

// SPDX-License-Identifier: MIT OR Apache-2.0
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {securityAnd,securityNot,securityOr} from '../../../../../../src/extensions/security/logic';

type Refusal = {name:string;operation:'securityAnd'|'securityOr';values?:unknown[];operandCount?:number;code:string;message:string;path:string};
type NotRefusal = {name:string;value:unknown;code:string;message:string;path:string};
const packetPath='docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/frozen-typescript.json';
const packet=JSON.parse(readFileSync(packetPath,'utf8')) as {
  predecessor:{source:string;sourceSha256:string;testSource:string;testSourceSha256:string;contract:string;contractSha256:string};
  truths:('T'|'F'|'U')[]; not:string[]; and:string[][]; or:string[][];
  refusals:Refusal[]; notRefusals:NotRefusal[];
};
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
for(const [path,expected] of [
  [packet.predecessor.source,packet.predecessor.sourceSha256],
  [packet.predecessor.testSource,packet.predecessor.testSourceSha256],
  [packet.predecessor.contract,packet.predecessor.contractSha256],
]) assert.equal(hash(path),expected,`source changed: ${path}`);

const states=packet.truths;
assert.deepEqual(states.map(securityNot),packet.not);
assert.deepEqual(states.map(a=>states.map(b=>securityAnd([a,b]))),packet.and);
assert.deepEqual(states.map(a=>states.map(b=>securityOr([a,b]))),packet.or);
for(const row of packet.refusals){
  const operands=row.values??Array(row.operandCount).fill('T');
  let caught:unknown;
  try{(row.operation==='securityAnd'?securityAnd:securityOr)(operands as ('T'|'F'|'U')[])}catch(error){caught=error;}
  assert.ok(caught,`${row.name} unexpectedly succeeded`);
  assert.equal((caught as {code:string}).code,row.code,row.name);
  assert.equal((caught as {message:string}).message,row.message,row.name);
  assert.equal((caught as {path:string}).path,row.path,row.name);
}
for(const row of packet.notRefusals){
  let caught:unknown;
  try{securityNot(row.value as 'T'|'F'|'U')}catch(error){caught=error;}
  assert.ok(caught,`${row.name} unexpectedly succeeded`);
  assert.equal((caught as {code:string}).code,row.code,row.name);
  assert.equal((caught as {message:string}).message,row.message,row.name);
  assert.equal((caught as {path:string}).path,row.path,row.name);
}
console.log(JSON.stringify({runtime:process.versions.bun,sourceHashes:'matched',truthTableCells:9,notCases:3,refusals:packet.refusals.length+packet.notRefusals.length}));

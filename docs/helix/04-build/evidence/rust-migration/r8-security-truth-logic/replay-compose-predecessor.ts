// SPDX-License-Identifier: MIT OR Apache-2.0
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {composeSecurityRules} from '../../../../../../src/extensions/security/logic';

const path='docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/compose-cases.json';
const packet=JSON.parse(readFileSync(path,'utf8')) as any;
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
for(const [file,digest] of [[packet.predecessor.source,packet.predecessor.sourceSha256],[packet.predecessor.testSource,packet.predecessor.testSourceSha256],[packet.predecessor.contract,packet.predecessor.contractSha256]]) assert.equal(hash(file),digest,`source changed: ${file}`);
for(const row of packet.cases){
  const rules=row.input.manyRules ? [...row.input.rules,...Array(row.input.manyRules-row.input.rules.length).fill({effect:'permit',truth:'T'})] : row.input.rules;
  try {
    const result=composeSecurityRules(rules,row.input.protectedFields);
    assert.equal(row.error,undefined,`${row.name} unexpectedly succeeded`);
    assert.deepEqual(JSON.parse(JSON.stringify(result)),row.oracle,row.name);
  } catch(error) {
    assert.ok(row.error,`${row.name} unexpectedly refused: ${String(error)}`);
    const actual=error as {code:string;message:string;path:string};
    assert.deepEqual({code:actual.code,message:actual.message,path:actual.path},row.error,row.name);
  }
}
console.log(JSON.stringify({runtime:process.versions.bun,cases:packet.cases.length,oracleCases:packet.cases.filter((row:any)=>row.oracle).length,refusalCases:packet.cases.filter((row:any)=>row.error).length,sourceHashes:'matched'}));

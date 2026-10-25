// SPDX-License-Identifier: MIT OR Apache-2.0
import {strict as assert} from 'node:assert';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {securityRefIdentity} from '../../../../../../src/extensions/security/types';

const packetPath='docs/helix/04-build/evidence/rust-migration/r8-security-truth-logic/ref-identity-cases.json';
const packet=JSON.parse(readFileSync(packetPath,'utf8')) as any;
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
for(const [file,digest] of [[packet.predecessor.source,packet.predecessor.sourceSha256],[packet.predecessor.testSource,packet.predecessor.testSourceSha256],[packet.predecessor.contract,packet.predecessor.contractSha256]]) assert.equal(hash(file),digest,`source changed: ${file}`);
for(const row of packet.cases) assert.equal(securityRefIdentity(row.ref),row.expected,row.name);
console.log(JSON.stringify({runtime:process.versions.bun,cases:packet.cases.length,sourceHashes:'matched'}));

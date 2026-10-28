// SPDX-License-Identifier: MIT OR Apache-2.0
// Offline installed-package replay for the three V4-selected Arrow IPC calls.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';

const repo=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const entry=resolve(process.argv[2]??'');
assert(process.argv[2],'pass installed package default or ./reference entry path');
const packetPath=resolve(repo,'docs/helix/04-build/evidence/rust-migration/r5-arrow-ipc-capture-predecessor-20261027/typescript-arrow-ipc-capture.json.gz');
const packetBytes=await readFile(packetPath),packet=JSON.parse(gunzipSync(packetBytes));
assert.equal(packet.profile,'umf.arrow-ipc-typescript-predecessor/1');
const subject=await import(pathToFileURL(entry));
for(const name of ['captureArrowIpc','inspectArrowIpcCapture','exportArrowIpcCapture'])assert.equal(typeof subject[name],'function',`missing ${name}`);
const fixtureRoot=resolve(repo,'fixtures/arrow/ipc-inputs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const inputs=async row=>row.file?new Uint8Array(await readFile(resolve(fixtureRoot,row.file))):row.name==='empty'?new Uint8Array():row.name==='invalid'?new Uint8Array([0,255,0]):row.name==='truncated'?new Uint8Array((await readFile(resolve(fixtureRoot,'int64.stream.arrow'))).subarray(0,20)):row.name==='trailing'?new Uint8Array(Buffer.concat([await readFile(resolve(fixtureRoot,'int64.stream.arrow')),Buffer.from([0,255,7])])):new Uint8Array(1_000_000);
let operations=0;
for(const row of packet.cases){
 const bytes=await inputs(row);
 assert.deepEqual({byteLength:bytes.length,sha256:sha(bytes)},row.input,`${row.name} input`);
 const captured=subject.captureArrowIpc(bytes,{id:row.file??row.name});
 const json=JSON.stringify(captured);
 assert.deepEqual({jsonSha256:sha(Buffer.from(json)),jsonByteLength:Buffer.byteLength(json)},row.document,`${row.name} capture`);
 const inspection=subject.inspectArrowIpcCapture(captured);
 assert.deepEqual(JSON.parse(JSON.stringify(inspection)),row.inspect,`${row.name} inspection`);
 const exported=subject.exportArrowIpcCapture(captured);
 assert.equal(exported.byteLength,row.export.byteLength,`${row.name} exported length`);
 assert.equal(sha(exported),row.export.sha256,`${row.name} exported SHA`);
 bytes.fill(0);
 assert.equal(sha(subject.exportArrowIpcCapture(captured)),row.export.sha256,`${row.name} capture detached from input`);
 operations+=3;
}
for(const row of packet.mutations){
 assert.deepEqual(JSON.parse(JSON.stringify(subject.inspectArrowIpcCapture(row.document))),row.inspect.value,`${row.name} mutation inspection`);operations++;
 assert.throws(()=>subject.exportArrowIpcCapture(row.document),error=>error?.code===row.exported.error.code&&error?.message===row.exported.error.message,`${row.name} mutation export`);operations++;
}
assert.throws(()=>subject.captureArrowIpc(new Uint8Array(1_000_001),{id:'oversize'}),error=>error?.code===packet.oversize.error.code&&error?.message===packet.oversize.error.message);
operations++;
console.log(JSON.stringify({status:'pass',entry,packetSha256:sha(packetBytes),cases:packet.cases.length,operations,scope:'captureArrowIpc, inspectArrowIpcCapture, exportArrowIpcCapture only'}));

// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze TypeScript Arrow IPC host admission and raw-host ordering for R8.
import {createHash} from 'node:crypto';
import {writeFile, mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {gzipSync} from 'node:zlib';
import vm from 'node:vm';

const root = resolve(import.meta.dir, '../../..');
const outDir = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-arrow-ipc-host-boundary-20261028');
const sourcePath = resolve(root, 'src/adapters/arrow/capture.ts');
const {captureArrowIpc, exportArrowIpcCapture, inspectArrowIpcCapture, ARROW_IPC_MAX_BYTES} = await import(sourcePath);
const sha = b => createHash('sha256').update(b).digest('hex');
const outcome = fn => {
  try { const value = fn(); return {kind: 'return', value: value instanceof Uint8Array ? {class: value.constructor.name, byteLength: value.byteLength, bytes: [...value]} : value}; }
  catch (e) { return {kind: 'throw', error: {constructor: e?.constructor?.name, name: e?.name, code: e?.code ?? null, path: e?.path ?? null, message: String(e?.message ?? e)}}; }
};
const inputs = [];
const record = (name, bytes, options) => {
  const events = [];
  const opts = options ?? {get id(){events.push('id:get'); return 'ok';}};
  const result = outcome(() => captureArrowIpc(bytes, opts));
  inputs.push({name, byteClass: bytes?.constructor?.name ?? null, sameRealm: bytes instanceof Uint8Array,
    events, result});
};
record('ordinary-array', [1,2], {get id(){return 'id';}});
record('data-view', new DataView(new ArrayBuffer(2)), {get id(){return 'id';}});
record('buffer-subclass', Buffer.from([1,2]), {get id(){return 'id';}});
class DerivedBytes extends Uint8Array { [Symbol.iterator]() { this.events.push('bytes:iterate'); return super[Symbol.iterator](); } }
const derived = new DerivedBytes([1,2]); derived.events = [];
record('typed-array-subclass', derived, {get id(){derived.events.push('id:get'); return 'derived';}});
inputs.at(-1).events = derived.events;
class NonByteIterator extends Uint8Array { [Symbol.iterator]() { return [256, -1, 1.5][Symbol.iterator](); } }
record('subclass-non-byte-iterator-values', new NonByteIterator([0]), {id:'coercion'});
record('cross-realm-uint8array', vm.runInNewContext('new Uint8Array([1,2])'), {get id(){return 'id';}});
record('oversize-precedes-id-getter', new Uint8Array(ARROW_IPC_MAX_BYTES + 1), {get id(){throw new Error('id getter reached');}});
record('wrong-class-precedes-id-getter', [], {get id(){throw new Error('id getter reached');}});
record('non-string-id', new Uint8Array([3]), {id: 3});
const ordering = [];
class ThrowingBytes extends Uint8Array { [Symbol.iterator]() { ordering.push('bytes:iterate'); throw new Error('iterator first'); } }
const orderedResult = outcome(() => captureArrowIpc(new ThrowingBytes([4,5]), {get id(){ordering.push('id:get'); throw new Error('id second');}}));
inputs.push({name:'iterator-failure-precedes-id-getter', byteClass:'Uint8Array subclass', sameRealm:true, events:ordering, result:orderedResult});
const base = captureArrowIpc(new Uint8Array([9]), {id:'proxy-controls'});
const documentReads = {};
for (const [name, operation] of [['inspect', inspectArrowIpcCapture], ['export', exportArrowIpcCapture]]) {
  const events = [];
  const proxied = new Proxy(base, {get(target, key, receiver) { events.push(`get:${String(key)}`); return Reflect.get(target,key,receiver); }, ownKeys(target) { events.push('ownKeys'); return Reflect.ownKeys(target); }});
  documentReads[name] = {events: [], result: outcome(() => operation(proxied))};
  documentReads[name].events = events;
}
const packet = {profile:'umf.arrow-ipc-host-predecessor/1', contract:'CONTRACT-016', source:'src/adapters/arrow/capture.ts', sourceSha256:sha(await (await import('node:fs/promises')).readFile(sourcePath)), maxBytes:ARROW_IPC_MAX_BYTES, inputs, documentReads};
await mkdir(outDir,{recursive:true});
const bytes=Buffer.from(JSON.stringify(packet));
await writeFile(resolve(outDir,'typescript-arrow-ipc-host-boundary.json.gz'),gzipSync(bytes,{mtime:0}));
console.log(JSON.stringify({cases:inputs.length,documentReads:Object.keys(documentReads),jsonBytes:bytes.length,jsonSha256:sha(bytes),gzipSha256:sha(gzipSync(bytes,{mtime:0}))}));

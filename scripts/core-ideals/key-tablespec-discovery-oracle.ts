/** Host-only native discovery; this does not qualify the Key binding. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const python=process.env.UMF_TABLESPEC_PYTHON??'/home/erik/Projects/tablespec/.venv/bin/python';
const child=Bun.spawn([python,'scripts/core-ideals/key-tablespec-discovery-oracle.py'],{stdout:'inherit',stderr:'inherit'});
assert.equal(await child.exited,0,'Native Key discovery failed');
const proof=await Bun.file('fixtures/validation/key-tablespec-discovery-native.json').json();
assert.equal(proof.nativeVersion,'647e8e566ad78b864282ec65c0b0b2237aa63084');
assert.equal(proof.cases.length,16);
assert.equal(proof.bindingImplemented,false);
for(const [path,hash] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),hash,`Stale native proof: ${path}`);
console.log(JSON.stringify({scope:proof.scope,cases:proof.cases.length,checkedFingerprints:Object.keys(proof.sha256).length,bindingImplemented:false}));

/** Host-only native discovery command; no browser adapter support is implied. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const python=process.env.UMF_TABLESPEC_PYTHON??'/home/erik/Projects/tablespec/.venv/bin/python';
const command=[python,'scripts/core-ideals/cardinality-tablespec-profile-oracle.py'];
const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit',env:{...process.env,JAVA_HOME:process.env.JAVA_HOME??'/home/erik/.local/share/mise/installs/java/openjdk-21.0.2'}});
assert.equal(await child.exited,0,'Native Cardinality profile probe failed');
const proof=await Bun.file('fixtures/validation/cardinality-tablespec-profile-native.json').json();
assert.equal(proof.nativeVersion,'647e8e566ad78b864282ec65c0b0b2237aa63084');
assert.equal(proof.declarations.length,28);assert.equal(proof.values.length,13);
for(const [path,hash] of Object.entries(proof.sha256)){
 assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),hash,`Stale native proof: ${path}`);
}
console.log(JSON.stringify({scope:'TableSpec Cardinality native discovery only',declarations:28,valueCases:13,checkedFingerprints:Object.keys(proof.sha256).length,bindingImplemented:false}));

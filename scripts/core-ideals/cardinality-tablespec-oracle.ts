/** Host-only acceptance entrypoint for the qualified TableSpec Cardinality binding. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const python=process.env.UMF_TABLESPEC_PYTHON??'/home/erik/Projects/tablespec/.venv/bin/python';
const commands=[['bun','scripts/core-ideals/cardinality-tablespec-profile-oracle.ts'],['bun','scripts/core-ideals/cardinality-tablespec-classification-corpus.ts'],[python,'scripts/core-ideals/cardinality-tablespec-classification-oracle.py'],['bun','scripts/core-ideals/cardinality-tablespec-projection-corpus.ts'],[python,'scripts/core-ideals/cardinality-tablespec-projection-oracle.py']];
const runs=[];
for(const command of commands){const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit',env:{...process.env,JAVA_HOME:process.env.JAVA_HOME??'/home/erik/.local/share/mise/installs/java/openjdk-21.0.2'}});const exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,`Native check failed: ${command.join(' ')}`);}
const paths=['scripts/core-ideals/cardinality-tablespec-oracle.ts','src/core-ideals/cardinality-tablespec.ts','src/core-ideals/cardinality-tablespec-projection.ts','spec/core/tablespec-cardinality-classification.schema.json','spec/core/cardinality-tablespec-projection.schema.json','spec/extensions/tablespec-cardinality/package.json','spec/extensions/tablespec-cardinality/schema.json'];
const proofs=[];
for(const suffix of ['profile-native','classification-native','projection-native']){
 const path=`fixtures/validation/cardinality-tablespec-${suffix}.json`,proof=await Bun.file(path).json();
 assert.equal(proof.nativeVersion,'647e8e566ad78b864282ec65c0b0b2237aa63084');
 for(const [file,expected] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex'),expected,`Stale proof: ${file}`);
 paths.push(path,...Object.keys(proof.sha256));proofs.push(path);
}
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/cardinality-tablespec-native.json',JSON.stringify({scope:'Qualified declared shape and explicit native carrier projection; retained native/ideal recovery; no native equivalence',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',nativeEquivalence:false,runs,proofs,sha256},null,2)+'\n');
console.log(JSON.stringify({nativeCommands:runs.length,proofs:proofs.length}));

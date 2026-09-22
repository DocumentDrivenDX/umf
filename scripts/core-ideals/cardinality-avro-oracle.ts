/** Host-only acceptance entrypoint for the qualified Avro Cardinality binding. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const commands=[['.venv/bin/python','scripts/core-ideals/cardinality-avro-native.py'],['bun','scripts/core-ideals/cardinality-avro-projection-oracle.ts']];
const runs=[];
for(const command of commands){const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit',env:process.env});const exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,`Native check failed: ${command.join(' ')}`);}
const paths=['scripts/core-ideals/cardinality-avro-oracle.ts','src/core-ideals/cardinality-avro.ts','src/core-ideals/cardinality-avro-projection.ts','spec/core/avro-cardinality-classification.schema.json','spec/core/cardinality-avro-projection.schema.json','spec/extensions/avro-cardinality/package.json','spec/extensions/avro-cardinality/schema.json'];
const proofs=[];
for(const suffix of ['profile-native','projection-native','projection-oracle']){
 const path=`fixtures/validation/cardinality-avro-${suffix}.json`,proof=await Bun.file(path).json();
 if(proof.versions){assert.equal(proof.versions.apache,'1.12.0');assert.equal(proof.versions.fastavro,'1.12.2');}
 const fingerprints=proof.sha256??proof.fingerprints;
 for(const [file,expected] of Object.entries(fingerprints))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex'),expected,`Stale proof: ${file}`);
 paths.push(path,...Object.keys(fingerprints));proofs.push(path);
}
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/cardinality-avro-native.json',JSON.stringify({scope:'Qualified declared shape and explicit native carrier projection; retained native/ideal recovery; no native equivalence',nativeVersions:{apache:'1.12.0',fastavro:'1.12.2'},nativeEquivalence:false,runs,proofs,sha256},null,2)+'\n');
console.log(JSON.stringify({nativeCommands:runs.length,proofs:proofs.length}));

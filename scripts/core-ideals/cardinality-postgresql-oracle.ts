/** Host-only acceptance entrypoint for the qualified PostgreSQL Cardinality binding. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const commands=[['bun','scripts/core-ideals/cardinality-postgresql-catalog-oracle.ts'],['bun','scripts/core-ideals/cardinality-postgresql-projection-oracle.ts']];
const runs=[];
for(const command of commands){const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit',env:process.env});const exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,`Native check failed: ${command.join(' ')}`);}
const paths=['scripts/core-ideals/cardinality-postgresql-oracle.ts','src/core-ideals/cardinality-postgresql.ts','src/core-ideals/cardinality-postgresql-projection.ts','spec/core/postgresql-cardinality-classification.schema.json','spec/core/cardinality-postgresql-projection.schema.json','spec/extensions/postgresql-cardinality/package.json','spec/extensions/postgresql-cardinality/schema.json'];
const proofs=[];
for(const suffix of ['catalog-native','projection-native']){
 const path=`fixtures/validation/cardinality-postgresql-${suffix}.json`,proof=await Bun.file(path).json();
 assert.equal(proof.serverVersion,170004);
 const fingerprints=proof.sha256??proof.fingerprints;
 for(const [file,expected] of Object.entries(fingerprints))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex'),expected,`Stale proof: ${file}`);
 paths.push(path,...Object.keys(fingerprints));proofs.push(path);
}
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/cardinality-postgresql-native.json',JSON.stringify({scope:'Qualified declared shape and explicit native carrier projection; retained native/ideal recovery; no native equivalence',nativeVersion:'17.4',nativeEquivalence:false,runs,proofs,sha256},null,2)+'\n');
console.log(JSON.stringify({nativeCommands:runs.length,proofs:proofs.length}));

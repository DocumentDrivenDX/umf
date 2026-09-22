/** Host-only acceptance entrypoint for the qualified SQL Server Cardinality binding. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const commands=[['bun','scripts/core-ideals/cardinality-sqlserver-profile-oracle.ts'],['bun','scripts/core-ideals/cardinality-sqlserver-projection-oracle.ts']];
const runs=[];
for(const command of commands){const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit',env:process.env});const exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,`Native check failed: ${command.join(' ')}`);}
const paths=['scripts/core-ideals/cardinality-sqlserver-oracle.ts','src/core-ideals/cardinality-sqlserver.ts','src/core-ideals/cardinality-sqlserver-projection.ts','spec/core/sqlserver-cardinality-classification.schema.json','spec/core/cardinality-sqlserver-projection.schema.json','spec/extensions/sqlserver-cardinality/package.json','spec/extensions/sqlserver-cardinality/schema.json'];
const proofs=[];
for(const suffix of ['profile-native','projection-native']){
 const path=`fixtures/validation/cardinality-sqlserver-${suffix}.json`,proof=await Bun.file(path).json();
 assert.equal(proof.serverVersion,'16.0.4295.3');
 const fingerprints=proof.sha256??proof.fingerprints;
 for(const [file,expected] of Object.entries(fingerprints))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex'),expected,`Stale proof: ${file}`);
 paths.push(path,...Object.keys(fingerprints));proofs.push(path);
}
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/cardinality-sqlserver-native.json',JSON.stringify({scope:'Qualified declared shape and explicit native carrier projection; retained native/ideal recovery; no native equivalence',nativeVersion:'16.0.4295.3',nativeEquivalence:false,runs,proofs,sha256},null,2)+'\n');
console.log(JSON.stringify({nativeCommands:runs.length,proofs:proofs.length}));

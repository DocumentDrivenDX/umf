/** Host-only native verification entrypoint; does not itself grant binding acceptance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const commands=[['.venv/bin/python','scripts/core-ideals/cardinality-parquet-native.py'],['bun','scripts/core-ideals/cardinality-parquet-carrier-oracle.ts'],['bun','scripts/core-ideals/cardinality-parquet-projection-oracle.ts']];
const runs=[];
for(const command of commands){const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit',env:process.env});const exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,command.join(' '));}
const paths=['scripts/core-ideals/cardinality-parquet-oracle.ts','scripts/core-ideals/cardinality-parquet-composition.ts','src/core-ideals/cardinality-parquet.ts','src/core-ideals/cardinality-parquet-projection.ts','spec/core/parquet-cardinality-classification.schema.json','spec/core/cardinality-parquet-projection.schema.json','spec/extensions/parquet-cardinality/package.json','spec/extensions/parquet-cardinality/schema.json'];
const proofs=[];
for(const suffix of ['profile-native','carrier-native','projection-native']){
 const path=`fixtures/validation/cardinality-parquet-${suffix}.json`,proof=await Bun.file(path).json();assert.equal(proof.runtime,'PyArrow 21.0.0');
 for(const [file,expected] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex'),expected,`Stale proof: ${file}`);
 paths.push(path,...Object.keys(proof.sha256));proofs.push(path);
}
for(const path of ['fixtures/validation/cardinality-parquet-profile-native.json','fixtures/validation/cardinality-parquet-carrier-corpus.json','fixtures/validation/cardinality-parquet-projection-corpus.json']){
 const corpus=await Bun.file(path).json();paths.push(path);
 for(const row of corpus.rows??corpus.cases){assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(row.path).arrayBuffer())).digest('hex'),row.sha256,row.path);paths.push(row.path);}
}
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/cardinality-parquet-native.json',JSON.stringify({scope:'Native schema/value counterexamples, explicit carriers and authored projection with both retained recovery directions; no native equivalence',nativeVersions:{pyarrow:'21.0.0'},nativeEquivalence:false,runs,proofs,sha256},null,2)+'\n');
console.log(JSON.stringify({nativeCommands:runs.length,proofs:proofs.length}));

/** Pinned native stages; historical evidence alone cannot pass this command. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const stages=['discovery','selection-oracle','projection-oracle','composition'];
const proofs=['discovery','discovery-native','selection-oracle','selection-native','projection-native','composition'];
const runs=[];
for(const stage of stages){const command=['bun',`scripts/core-ideals/facets-avro-${stage}.ts`],child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit'}),exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,`Native stage failed: ${stage}`);}
const paths=['scripts/core-ideals/facets-avro-oracle.ts'];
for(const name of proofs){
 const path=`fixtures/validation/facets-avro-${name}.json`,proof=await Bun.file(path).json();
 if(name!=='composition')assert.deepEqual(proof.versions,{apache:'1.12.0',fastavro:'1.12.2'});
 for(const [p,h] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex'),h,`Stale native proof: ${p}`);
 paths.push(path,...Object.keys(proof.sha256));
}
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/facets-avro-native.json',JSON.stringify({scope:'Pinned Avro native discovery, branch selection, authored targets and composed retained recovery; compatibility and prior concept gates remain separate',versions:{apache:'1.12.0',fastavro:'1.12.2'},bindingAccepted:false,idealAdmitted:false,nativeEquivalence:false,runs,sha256},null,2)+'\n');console.log(JSON.stringify({nativeCommands:runs.length,bindingAccepted:false}));

/** Run native facet qualification in dependency order; prior concept gates remain separate. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const stages=['discovery','association-native','projection-native','composition'];
const proofs=['discovery-native','association-native','projection-native','composition'];
const runs=[];
for(const stage of stages){const command=['bun',`scripts/core-ideals/facets-sqlserver-${stage}.ts`];const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit'});const exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,`Native facet stage failed: ${stage}`);}
const paths=['scripts/core-ideals/facets-sqlserver-oracle.ts'];
for(const name of proofs){
 const path=`fixtures/validation/facets-sqlserver-${name}.json`,proof=await Bun.file(path).json();assert.equal(proof.serverVersion,'16.0.4295.3');
 for(const [p,h] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex'),h,`Stale native proof: ${p}`);
 paths.push(path,...Object.keys(proof.sha256));
}
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/facets-sqlserver-native.json',JSON.stringify({scope:'SQL Server 2022 16.0.4295.3 native facet discovery, CHECK association, authored DDL/value probes and composed retained recovery; full compatibility refresh required before binding acceptance',serverVersion:'16.0.4295.3',bindingAccepted:false,idealAdmitted:false,nativeEquivalence:false,runs,sha256},null,2)+'\n');
console.log(JSON.stringify({nativeCommands:runs.length,bindingAccepted:false}));

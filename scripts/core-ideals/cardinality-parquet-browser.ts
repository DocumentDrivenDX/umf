/** Real-browser verification entrypoint; full acceptance remains a separate gate. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const parts=['profile','carrier','classification','projection'];
const runs=[];
for(const part of parts){const command=['bun',`scripts/core-ideals/cardinality-parquet-${part}-browser.ts`];const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit',env:process.env});const exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,command.join(' '));}
const paths=['scripts/core-ideals/cardinality-parquet-browser.ts'],checks:Record<string,unknown>={},browsers=new Set<string>();
for(const part of parts){
 const path=`fixtures/validation/cardinality-parquet-${part}-browser.json`,proof=await Bun.file(path).json();
 assert.ok(proof.browser.startsWith('148.'));assert.deepEqual(proof.externalRequests,[]);browsers.add(proof.browser);checks[part]=proof.checks;
 for(const [file,expected] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex'),expected,`Stale proof: ${file}`);
 paths.push(path,...Object.keys(proof.sha256));
}
assert.equal(browsers.size,1);
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/cardinality-parquet-browser.json',JSON.stringify({scope:'Real Chromium native inspection, classification and authored projection parity; both retained recovery directions, no native equivalence',browser:[...browsers][0],checks,runs,sha256},null,2)+'\n');
console.log(JSON.stringify({browserCommands:runs.length,checks}));

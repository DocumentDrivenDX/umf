/** Browser facets use the current public bundle. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const stages=['discovery','predicate','constraints','classification','projection','composition'];
const runs=[],paths=['scripts/core-ideals/facets-sqlserver-browser.ts'];let browserVersion:string|undefined;
for(const stage of stages){
 const command=['bun',`scripts/core-ideals/facets-sqlserver-${stage}-browser.ts`],child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit'}),exitCode=await child.exited;
 runs.push({command,exitCode});assert.equal(exitCode,0,`Browser facet stage failed: ${stage}`);
 const path=`fixtures/validation/facets-sqlserver-${stage}-browser.json`,proof=await Bun.file(path).json();
 assert.ok(typeof proof.browser==='string');if(browserVersion)assert.equal(proof.browser,browserVersion);else browserVersion=proof.browser;
 assert.deepEqual(proof.externalRequests,[]);
 for(const [p,h] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex'),h,`Stale browser proof: ${p}`);
 paths.push(path,...Object.keys(proof.sha256));
}
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/facets-sqlserver-browser.json',JSON.stringify({scope:'Experimental SQL Server facet classification, authored projection and retained recovery in Chromium JavaScript; compatibility and prior concept gates remain separate',browser:browserVersion,bindingAccepted:false,nativeEquivalence:false,runs,externalRequests:[],sha256},null,2)+'\n');
console.log(JSON.stringify({browserCommands:runs.length,bindingAccepted:false}));

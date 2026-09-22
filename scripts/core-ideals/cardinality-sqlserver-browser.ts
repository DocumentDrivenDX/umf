/** Run both qualified SQL Server Cardinality browser matrices against the current build. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const runs=[],checks:Record<string,unknown>={},paths=['scripts/core-ideals/cardinality-sqlserver-browser.ts','dist/umf.js'];let browser='';
for(const part of ['classification','projection']){
 const script=`scripts/core-ideals/cardinality-sqlserver-${part}-browser.ts`,command=['bun',script];
 const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit',env:process.env}),exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,`${part} browser failed`);
 const path=`fixtures/validation/cardinality-sqlserver-${part}-browser.json`,proof=await Bun.file(path).json();assert.deepEqual(proof.externalRequests,[]);assert.match(proof.browser,/^148\./);if(browser)assert.equal(proof.browser,browser);browser=proof.browser;checks[part]=proof.checks;
 const fingerprints=proof.sha256??proof.fingerprints;
 for(const [file,expected] of Object.entries(fingerprints))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex'),expected,`Stale browser proof: ${file}`);
 paths.push(script,path,...Object.keys(fingerprints));
}
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/cardinality-sqlserver-browser.json',JSON.stringify({scope:'Qualified classification/projection and retained recovery in real Chromium; no host globals or external requests',browser,checks,runs,externalRequests:[],sha256},null,2)+'\n');console.log(JSON.stringify(checks));

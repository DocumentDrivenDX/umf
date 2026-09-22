/** Both directions and explicit suite profiles against the current public browser bundle. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const runs=[],checks:Record<string,unknown>={},paths=['scripts/core-ideals/facets-tablespec-browser.ts','dist/umf.js'];let browser='';
for(const part of ['classification','suite','projection']){
 const script=`scripts/core-ideals/facets-tablespec-${part}-browser.ts`,command=['bun',script];
 const child=Bun.spawn(command,{stdout:'inherit',stderr:'inherit',env:process.env}),exitCode=await child.exited;runs.push({command,exitCode});assert.equal(exitCode,0,`${part} browser failed`);
 const path=`fixtures/validation/facets-tablespec-${part}-browser.json`,proof=await Bun.file(path).json();assert.deepEqual(proof.externalRequests,[]);if(browser)assert.equal(proof.browser,browser);browser=proof.browser;checks[part]=proof.checks;paths.push(script,path);
 for(const [p,h] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex'),h,`Stale browser proof: ${p}`);
}
const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/facets-tablespec-browser.json',JSON.stringify({scope:'Experimental facet classification/projection and retained recovery in Chromium; complete compatibility refresh pending',browser,checks,runs,externalRequests:[],bindingAccepted:false,sha256},null,2)+'\n');console.log(JSON.stringify(checks));

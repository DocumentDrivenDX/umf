import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const nativePath='docs/helix/04-build/evidence/security/truss-candidate-condition-native.json',foundationPath='docs/helix/04-build/evidence/security/truss-candidate-condition.json';
const native=await Bun.file(nativePath).json(),foundation=await Bun.file(foundationPath).json();
const source='/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition.ts';
const digest=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
for(const [p,h] of Object.entries(native.sourceDigests))if(await digest(p)!==h)throw Error('Stale native conditional source');
const paths=[nativePath,foundationPath,source,'tools/security/truss-candidate-condition-browser.ts',...Object.keys(native.sourceDigests)];
const before=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
const built=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!built.success)throw Error('Browser build failed');const js=await built.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/module.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Draft condition SQL</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:Bun.env.UMF_CHROMIUM_PATH});const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async artifacts=>{const url='/module.js',module=await import(url);return {matches:artifacts.map((a:any)=>({id:a.id,equal:(a.kind==='disclosure'?module.lowerCandidateSecurityDisclosure(a.input).sql:a.kind==='ruleFold'?module.lowerCandidateSecurityRuleFold(a.input).sql:module.lowerCandidateSecurityCondition(a.input))===a.sql})),hostGlobals:['Bun','process','Buffer'].filter(k=>k in globalThis)};},[...foundation.artifacts,...foundation.scalarArtifacts,...foundation.guardArtifacts,...foundation.foldArtifacts.map((a:any)=>({...a,kind:'ruleFold'})),...foundation.disclosureArtifacts.map((a:any)=>({...a,kind:'disclosure'}))]);
 if(observed.matches.length!==36||observed.matches.some((r:any)=>!r.equal)||observed.hostGlobals.length||external)throw Error('Browser SQL differs');
 for(const [p,h] of Object.entries(before))if(await digest(p)!==h)throw Error('Captured source changed');
 const receipt={status:'passed',sourceDigests:before,browser:await browser.version(),observed,externalRequests:external,nativeImplementationQualified:false,covers:['US-056-AC2'],scope:'Includes seventeen disclosure-metadata SQL programs including 100/101-field arrays. Includes four guard artifacts and six empty-disclosure rule-truth fold SQL programs; no data release or authorization. Real Chromium emits identical draft SQL to the source-bound four mappings of two original Rust mixed fixtures plus five original resource/context scalar fixtures, including deliberately edited and repinned decimal/binary/Boolean source domains whose truth diagnostics ran in PostgreSQL 17.9 synthetic raw projections. This compares SQL bytes, not browser native execution or graph authorization, complete facts, codecs, effects/disclosure or physical refinement.'};
 await Bun.write('docs/helix/04-build/evidence/security/truss-candidate-condition-browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'passed',artifacts:36,browser:receipt.browser}));
}finally{if(browser)await browser.close();server.stop(true);}

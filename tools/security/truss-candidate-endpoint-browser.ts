import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const source='/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-endpoint.ts';
const test='/Users/erik/Projects/truss/tests/security-candidate-endpoint.test.ts';
const proofPath='docs/helix/04-build/evidence/security/original-graph-ir-formal.json';
const proof=await Bun.file(proofPath).json();
const digest=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
const paths=[source,test,proofPath,'tools/security/truss-candidate-endpoint-browser.ts',...Object.keys(proof.sourceDigests)];
for(const [p,h] of Object.entries(proof.sourceDigests))if(await digest(p)!==h)throw Error('Stale original compiler source');
const before=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
const commands=[['bun','test',test],['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--allowImportingTsExtensions','--resolveJsonModule','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck',source,test,'tools/security/truss-candidate-endpoint-browser.ts']];
const runs=[];
for(const command of commands){const run=Bun.spawn(command,{stdout:'pipe',stderr:'pipe'});const [exitCode,stdout,stderr]=await Promise.all([run.exited,new Response(run.stdout).text(),new Response(run.stderr).text()]);runs.push({command,exitCode,stdout,stderr});if(exitCode)throw Error('Candidate endpoint check failed: '+stderr);}
const artifact=proof.artifacts.find((a:any)=>a.id==='mixed');if(!artifact)throw Error('Missing actual mixed IR');
const doc=JSON.parse(artifact.request.modules[0].documentJson),terms:any[]=[];
function walk(v:any){if(v&&typeof v==='object'){if(Object.hasOwn(v,'endpoint'))terms.push(v);else Object.values(v).forEach(walk);}}
walk(artifact.rules[0].condition);
const inputs=terms.map(term=>{const e=term.endpoint,target=doc.modules.find((m:any)=>m.id===e.target.moduleId).elements.find((t:any)=>t.id===e.target.elementId),key=target.keys.find((k:any)=>k.id===e.keyId);if(!key)throw Error('Missing original selected Key');return {term,mapping:{association:e.association,role:e.role,target:e.target,keyId:e.keyId,targetKeyFields:key.fields.map((f:any)=>({documentId:e.target.documentId,moduleId:f.module,elementId:f.element})),carrier:e.carrier,columns:key.fields.map((_:any,i:number)=>'endpoint_'+i)}};});
if(inputs.length!==4)throw Error('Unexpected actual endpoint coverage');
const built=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!built.success)throw Error('Browser build failed');const js=await built.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/module.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Draft endpoint mapping</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:Bun.env.UMF_CHROMIUM_PATH});const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async inputs=>{
  const url='/module.js',module=await import(url);let passed=0;const refusal=(f:()=>unknown)=>{try{f();return false;}catch{return true;}};
  for(const {term,mapping} of inputs){const bound=module.bindCandidateSecurityEndpoint(term,mapping);if(JSON.stringify(bound.binding)!==JSON.stringify(term.endpoint.binding)||JSON.stringify(bound.carrier)!==JSON.stringify(mapping.carrier)||JSON.stringify(bound.targetKeyFields)!==JSON.stringify(mapping.targetKeyFields)||!Object.isFrozen(bound.columns))throw Error('Lost endpoint meaning');passed++;
   if(!refusal(()=>module.bindCandidateSecurityEndpoint(term,{...mapping,keyId:'other'})))throw Error('Wrong Key accepted');passed++;
   const association='relationshipId' in mapping.association?{documentId:'domain',moduleId:'m',elementId:mapping.association.relationshipId}:{documentId:'domain',moduleId:'m',relationshipId:mapping.association.elementId};
   if(!refusal(()=>module.bindCandidateSecurityEndpoint(term,{...mapping,association})))throw Error('Wrong namespace accepted');passed++;
  }
  let accessed=false;if(!refusal(()=>module.bindCandidateSecurityEndpoint({get endpoint(){accessed=true;return {};}},inputs[0]!.mapping))||accessed)throw Error('Accessor invoked');passed++;
  return {passed,hostGlobals:['Bun','process','Buffer'].filter(k=>k in globalThis)};
 },inputs);
 if(observed.passed!==13||observed.hostGlobals.length||external)throw Error('Browser scope failed');
 for(const [p,h] of Object.entries(before))if(await digest(p)!==h)throw Error('Captured source changed');
 const receipt={status:'passed',sourceDigests:before,runs,browser:await browser.version(),inputs,observed,externalRequests:external,nativeImplementationQualified:false,scope:'Actual original Rust mixed IR endpoint snapshots and original selected Key field order, portable immutable mapping in Bun/strict TypeScript/real Chromium. No SQL emission, native inventory/domain/tuple-codec correspondence, source authentication, complete facts or backend acceptance.'};
 await Bun.write('docs/helix/04-build/evidence/security/truss-candidate-endpoint-browser.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:observed.passed,browser:receipt.browser}));
}finally{if(browser)await browser.close();server.stop(true);}

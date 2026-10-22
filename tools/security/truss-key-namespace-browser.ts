/** Real-browser replay of native-tested typed key correspondence. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const nativePath='docs/helix/04-build/evidence/security/truss-key-namespace-replay.json';
const source='/Users/erik/Projects/truss/packages/postgresql/src/security-key-namespace.ts';
const native=await Bun.file(nativePath).json();
const paths=[source,'tools/security/truss-key-namespace-browser.ts',nativePath];
const digest=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
for(const [p,hash] of Object.entries(native.sourceDigests))if(await digest(p)!==hash)throw Error('Stale native key source');
const before=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
const built=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!built.success)throw Error('Browser key build failed');
const javascript=await built.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/namespace.js'?new Response(javascript,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Truss namespace</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:Bun.env.UMF_CHROMIUM_PATH});const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async cases=>{
  const url='/namespace.js',m=await import(url);
  const outputs=new Map(cases.filter((c:any)=>c.canonicalValues).map((c:any)=>[JSON.stringify(c.canonicalValues),c.canonicalHex]));
  const results=[];
  for(const test of cases){const selected=structuredClone(test.selection);const verifier=m.createSecurityKeyNamespaceVerifier(selected,(values:any)=>{const original=outputs.get(JSON.stringify(values));if(!original)throw Error('Unobserved native encoder input');return original;});selected.sourceEpoch='changed';selected.encoding.sha256='0'.repeat(64);results.push({id:test.id,observed:await verifier.matches(test.stored),expected:test.expected});}
  return {results,hostGlobals:['Bun','process','Buffer'].filter(k=>k in globalThis)};
 },native.cases);
 if(observed.results.length!==native.observations.length||observed.results.some((r:any)=>r.observed!==r.expected)||observed.hostGlobals.length||external)throw Error('Real-browser namespace correspondence mismatch');
 for(const p of paths)if(before[p]!==await digest(p))throw Error('Key sources changed during browser replay');
 await Bun.write('docs/helix/04-build/evidence/security/truss-key-namespace-browser.json',JSON.stringify({status:'passed',sourceDigests:before,browser:await browser.version(),observed,externalRequests:external,scope:'Actual portable Truss namespace grammar/correspondence in real Chromium using immutable replay of original native canonical outputs. Signed/positive domains, exact canonical spelling and copied selection verified. Original producer/current native authority, actual zero/nonpositive definitions and protected graph/profile admission remain unqualified.'},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',checks:observed.results.length,browser:await browser.version()}));
}finally{if(browser)await browser.close();server.stop(true);}

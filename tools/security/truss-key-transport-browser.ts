import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const evidence='docs/helix/04-build/evidence/security/truss-key-transport.json';
const native=await Bun.file(evidence).json(),report=native.transportReport;
const source='/Users/erik/Projects/truss/packages/postgresql/src/security-key-transport.ts';
const ownerPath=report.producer.directory+'/producer.js';
const paths=[evidence,source,ownerPath,'tools/security/truss-key-transport-browser.ts'];
const digest=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
for(const [p,hash] of Object.entries(native.sourceDigests))if(await digest(p)!==hash)throw Error('Stale original transport source');
const before=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
const built=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!built.success)throw Error('Transport browser build failed');
const transportJs=await built.outputs[0]!.text(),ownerJs=await Bun.file(ownerPath).text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;return path==='/transport.js'||path==='/owner.js'?new Response(path==='/transport.js'?transportJs:ownerJs,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Truss original key transport</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:Bun.env.UMF_CHROMIUM_PATH});const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async ({report,stored})=>{
  const ownerUrl='/owner.js',transportUrl='/transport.js',owner=await import(ownerUrl),module=await import(transportUrl);
  const verifier=module.createSecurityKeyTransportVerifier(owner,{source:report.model,identity:report.identity,namespaceHex:report.expected.namespaceHex});
  return {encoded:verifier.encode(report.values),nativeOriginal:verifier.matches(report.values,stored[0]),foreignNamespaceRefused:!verifier.matches(report.values,stored[1]),changedPayloadRefused:!verifier.matches(report.values,{...stored[0],keyHex:stored[0].keyHex.slice(0,-2)+'00'}),hostGlobals:['Bun','process','Buffer'].filter(k=>k in globalThis)};
 },{report,stored:native.nativeStored});
 if(JSON.stringify(observed.encoded)!==JSON.stringify(report.expected)||!observed.nativeOriginal||!observed.foreignNamespaceRefused||!observed.changedPayloadRefused||observed.hostGlobals.length||external)throw Error('Browser/native original transport mismatch');
 for(const p of paths)if(await digest(p)!==before[p])throw Error('Transport source changed during browser replay');
 await Bun.write('docs/helix/04-build/evidence/security/truss-key-transport-browser.json',JSON.stringify({status:'passed',sourceDigests:before,browser:await browser.version(),observed,externalRequests:external,scope:'Actual registered UMF owner v3 tuple and portable Truss exact transport in real Chromium, compared with native 0.15 bytea bucket roundtrip. Exact decimal/Unicode/large-integer tokens retained; foreign namespace and changed payload refuse. Native installation/catalog namespace authority, complete graph/source/guard/role/custody profile remain unqualified.'},null,2)+'\n');console.log(JSON.stringify({status:'passed',checks:4,browser:await browser.version()}));
}finally{if(browser)await browser.close();server.stop(true);}

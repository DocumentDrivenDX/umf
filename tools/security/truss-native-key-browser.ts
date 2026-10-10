/** Real-browser replay of native-tested typed key correspondence. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const nativePath='docs/helix/04-build/evidence/security/truss-native-key.json';
const source='/Users/erik/Projects/truss/packages/postgresql/src/security-native-key.ts';
const native=await Bun.file(nativePath).json();
const paths=[source,'tools/security/truss-native-key-browser.ts',nativePath];
const digest=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
for(const [p,hash] of Object.entries(native.sourceDigests))if(await digest(p)!==hash)throw Error('Stale native key source');
const before=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
const built=await Bun.build({entrypoints:[source],target:'browser',format:'esm'});if(!built.success)throw Error('Browser key build failed');
const javascript=await built.outputs[0]!.text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/keys.js'?new Response(javascript,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Truss native keys</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,executablePath:Bun.env.UMF_CHROMIUM_PATH});const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async payload=>{
  const input=payload.typed;
  const url='/keys.js',m=await import(url);const original=m.securityNativeKeysCorrespond(input);
  const variants=[];let v=structuredClone(input);v.inventory.tables[1].keys.find((k:any)=>k.primary).columns.reverse();variants.push(v);
  v=structuredClone(input);v.inventory.tables[0].typeSources[0].type.elementId='Project';variants.push(v);
  v=structuredClone(input);v.types.find((t:any)=>t.type.elementId==='Staff').fields[0].column='wrong';variants.push(v);
  return {original,raw:m.securityNativeKeysCorrespond(payload.raw),refusals:variants.map(value=>!m.securityNativeKeysCorrespond(value)),hostGlobals:['Bun','process','Buffer'].filter(k=>k in globalThis)};
 },{typed:native.resolvedInput,raw:native.rawResolvedInput});
 if(!observed.original||!observed.raw||observed.refusals.some((v:boolean)=>!v)||observed.hostGlobals.length||external)throw Error('Real-browser key correspondence mismatch');
 for(const p of paths)if(before[p]!==await digest(p))throw Error('Key sources changed during browser replay');
 await Bun.write('docs/helix/04-build/evidence/security/truss-native-key-browser.json',JSON.stringify({status:'passed',sourceDigests:before,browser:await browser.version(),observed,externalRequests:external,scope:'Actual portable backend key correspondence in real Chromium on native retained typed TEXT/int4 keys/catalog observations, plus key order/catalog type/scalar key mapping controls. No original browser native authentication, installed graph business-key/property/FK/profile/authority or full admission qualification.'},null,2)+'\n');
 console.log(JSON.stringify({status:'passed',checks:5,browser:await browser.version()}));
}finally{if(browser)await browser.close();server.stop(true);}

/** B-SFP-001 source foundation only; no transform/catalog interpretation. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
import {readProtectionSource,writeProtectionSource} from '../../src/extensions/security/protection/source';
const digest=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const files=['src/extensions/security/protection/source.ts','src/model/json.ts','src/model/serialization.ts','src/model/types.ts',
 'tools/security/protection-source-browser.ts','tools/security/protection-boundary.ts','tests/security/protection/source.test.ts','bun.lock','tsconfig.tools.json'];
const before:Record<string,string>={};
for(const file of files)before[file]=digest(new Uint8Array(await Bun.file(file).arrayBuffer()));
const source={vocabulary:'umf.security.protection',version:'9.0.0',id:'future',revision:'r1',
 transforms:[{id:'future',version:'unknown',kind:'future',nested:[null,false,{text:'\u0000'}]}],
 native:{dialect:'future',sql:'CREATE FUTURE TRANSFORM;\n-- retained\n'},future:{Bun:'data, never executable'}};
const cases=(['json','yaml'] as const).map(format=>({format,text:writeProtectionSource(source,format)}));
const expected=cases.map(c=>readProtectionSource(c.text,c.format));
const build=await Bun.build({entrypoints:['src/extensions/security/protection/source.ts'],target:'browser',format:'esm'});
if(!build.success||build.outputs.length!==1)throw Error('Protection source browser build failed');
const js=await build.outputs[0]!.text();
if(js.length>1048576)throw Error('Protection browser fixture exceeds bound');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){return new URL(req.url).pathname==='/protection.js'
 ?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Protection source</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external++;return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}`);
 const observed=await page.evaluate(async(input)=>{
  const url='/protection.js',module=await import(url);
  return {rows:input.map(c=>module.readProtectionSource(module.writeProtectionSource(module.readProtectionSource(c.text,c.format),c.format),c.format)),
   hostGlobals:['Bun','process','Buffer','Deno'].filter(key=>key in globalThis)};
 },cases);
 if(JSON.stringify(observed.rows)!==JSON.stringify(expected)||observed.hostGlobals.length||external)throw Error('Protection source browser mismatch');
 const after:Record<string,string>={};for(const file of files)after[file]=digest(new Uint8Array(await Bun.file(file).arrayBuffer()));
 if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Protection source changed during browser run');
 const receipt={status:'source-foundation-passed',bun:Bun.version,chromium:browser.version(),formats:['json','yaml'],
  observations:observed,externalRequests:external,bundleSha256:digest(js),sourceDigests:after,
  scope:'Unknown protection source preservation only; no catalog/transform interpretation, browser API support beyond these operations or backend admission.'};
 await Bun.write('docs/helix/04-build/evidence/security/protection-source-20261014/browser.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:receipt.status,chromium:receipt.chromium,formats:receipt.formats}));
}finally{await browser?.close();server.stop(true);}

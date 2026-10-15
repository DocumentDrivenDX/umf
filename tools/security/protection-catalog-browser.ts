/** Component replay only: no S13-S25 acceptance promotion. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const files=['src/extensions/security/protection/catalog.ts','src/extensions/security/protection/source.ts','spec/extensions/security-protection/schema.json','spec/extensions/security-protection/package.json','tests/security/protection/catalog.test.ts','tests/security/protection/source.test.ts','tools/security/protection-catalog-browser.ts','tools/security/protection-boundary.ts','src/model/json.ts','src/model/types.ts','src/validation/schema.ts','bun.lock'];
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
const pins=async()=>Object.fromEntries(await Promise.all(files.map(async p=>[p,hash(new Uint8Array(await Bun.file(p).arrayBuffer()))])));
const before=await pins();
const build=await Bun.build({entrypoints:['src/extensions/security/protection/catalog.ts'],target:'browser',format:'esm'});
if(!build.success||build.outputs.length!==1)throw Error('Catalog browser build failed');
const js=await build.outputs[0]!.text();if(js.length>2_000_000)throw Error('Catalog browser bundle bound');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>new URL(r.url).pathname==='/catalog.js'?new Response(js,{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Catalog envelope</title>')});
let browser;
try{
 browser=await chromium.launch({headless:true,...(Bun.env.UMF_CHROMIUM_PATH?{executablePath:Bun.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();let external=0;
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():(external++,route.abort()));
 await page.goto(`http://127.0.0.1:${server.port}`);
 const observations=await page.evaluate(async()=>{
  const path='/catalog.js',api=await import(path),rows:{id:string;expected:boolean;observed:boolean}[]=[];
  const add=(id:string,observed:boolean)=>rows.push({id,expected:true,observed});
  const catalog=()=>({vocabulary:'umf.security.protection',version:'0.1.0',id:'c',revision:'r',transforms:[{id:'t',version:'1',kind:'future',future:{text:'retained'}}],native:{sql:'opaque'}});
  const source=catalog(),inspection=api.inspectProtectionCatalog(source);
  add('known-envelope',inspection.valid===true);add('never-complete',inspection.complete===false);
  add('unknown-payload-preserved',JSON.stringify(inspection.source)===JSON.stringify(source));
  let refused=false;try{api.requireProtectionInterpretation(source);}catch{refused=true;}add('require-refuses-unimplemented',refused);
  inspection.source.transforms[0].future.text='mutated';add('source-isolated',source.transforms[0]!.future.text==='retained');
  add('unknown-version-incomplete',!api.inspectProtectionCatalog({...source,version:'future'}).valid);
  const pairs=[{id:'a/b',version:'c'},{id:'a',version:'b/c'},{id:'é',version:'1'},{id:'e\u0301',version:'1'}];
  add('exact-pairs-no-normalization',api.inspectProtectionCatalog({...source,transforms:pairs}).valid);
  add('duplicate-pair-refused',!api.inspectProtectionCatalog({...source,transforms:[...pairs,pairs[0]]}).valid);
  const entries=Array.from({length:256},(_,i)=>({id:String(i),version:'1'}));
  add('bound-positive',api.inspectProtectionCatalog({...source,transforms:entries}).valid);
  add('bound-refusal',!api.inspectProtectionCatalog({...source,transforms:[...entries,{id:'extra',version:'1'}]}).valid);
  let getters=0;add('getters-never-called',!api.inspectProtectionCatalog({get id(){getters++;return 'id';}}).valid&&getters===0);
  const schema=api.protectionPackage.schema,prior=schema.properties.vocabulary.const;
  schema.properties.vocabulary.const='future';add('metadata-isolated',api.inspectProtectionCatalog(source).valid&&!api.inspectProtectionCatalog({...source,vocabulary:'future'}).valid);schema.properties.vocabulary.const=prior;
  add('host-globals-absent',['Bun','process','Buffer','Deno'].every(key=>!(key in globalThis)));
  return rows;
 });
 const after=await pins();if(external||observations.some(x=>x.expected!==x.observed)||JSON.stringify(before)!==JSON.stringify(after))throw Error('Catalog browser replay failed');
 const receipt={status:'catalog-envelope-component-passed',chromium:browser.version(),bun:Bun.version,observations,externalRequests:external,sourceDigests:after,bundleSha256:hash(js),acceptanceCasesPromoted:[],scope:'Envelope and exact transform identities only. Interpretation always refuses. No domain/query/custody/policy0.2, native enforcement or full S13-S25 qualification.'};
 await Bun.write('docs/helix/04-build/evidence/security/protection-catalog-20261015/browser.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:receipt.status,controls:observations.length,chromium:receipt.chromium}));
}finally{await browser?.close();server.stop(true);}

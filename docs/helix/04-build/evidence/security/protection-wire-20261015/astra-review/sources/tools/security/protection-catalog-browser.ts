/** Component replay only: no S13-S25 acceptance promotion. */
import {chromium} from 'playwright';
import {createHash} from 'node:crypto';
const files=['src/extensions/security/protection/catalog.ts','src/extensions/security/protection/source.ts','spec/extensions/security-protection/schema.json','spec/extensions/security-protection/package.json','tests/security/protection/catalog.test.ts','tests/security/protection/source.test.ts','tools/security/protection-catalog-browser.ts','tools/security/protection-boundary.ts','src/model/json.ts','src/model/types.ts','src/validation/schema.ts','src/model/schema-literals.ts','scripts/security-protection-schema.py','tests/security/protection/wire.test.ts','bun.lock'];
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
  const catalog=()=>({vocabulary:'umf.security.protection',version:'0.1.0',id:'c',revision:'r',transforms:[{id:'t',version:'1',kind:'mask',function:'constant',inputDomain:{documentId:'d',moduleId:'m',elementId:'in'},outputDomain:{documentId:'d',moduleId:'m',elementId:'out'},determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[],future:{text:'retained'}}],native:{sql:'opaque'}});
  const source=catalog(),inspection=api.inspectProtectionCatalog(source);
  add('known-envelope',inspection.valid===true);add('never-complete',inspection.complete===false);
  add('unknown-payload-preserved',JSON.stringify(inspection.source)===JSON.stringify(source));
  let refused=false;try{api.requireProtectionInterpretation(source);}catch{refused=true;}add('require-refuses-unimplemented',refused);
  inspection.source.transforms[0].future.text='mutated';add('source-isolated',source.transforms[0]!.future.text==='retained');
  add('unknown-version-incomplete',!api.inspectProtectionCatalog({...source,version:'future'}).valid);
  const pairs=[{id:'a/b',version:'c'},{id:'a',version:'b/c'},{id:'é',version:'1'},{id:'e\u0301',version:'1'}].map(x=>({...source.transforms[0]!,...x}));
  add('exact-pairs-no-normalization',api.inspectProtectionCatalog({...source,transforms:pairs}).valid);
  add('duplicate-pair-refused',!api.inspectProtectionCatalog({...source,transforms:[...pairs,pairs[0]]}).valid);
  const entries=Array.from({length:256},(_,i)=>({...source.transforms[0]!,id:String(i),version:'1'}));
  add('bound-positive',api.inspectProtectionCatalog({...source,transforms:entries}).valid);
  add('bound-refusal',!api.inspectProtectionCatalog({...source,transforms:[...entries,{...source.transforms[0]!,id:'extra',version:'1'}]}).valid);
  let getters=0;add('getters-never-called',!api.inspectProtectionCatalog({get id(){getters++;return 'id';}}).valid&&getters===0);
  const schema=api.protectionPackage.schema,prior=schema.properties.vocabulary.const;
  schema.properties.vocabulary.const='future';add('metadata-isolated',api.inspectProtectionCatalog(source).valid&&!api.inspectProtectionCatalog({...source,vocabulary:'future'}).valid);schema.properties.vocabulary.const=prior;
  const base=source.transforms[0]!,field=base.inputDomain;
  const withTransform=(patch:any)=>{const t:any={...base,...patch};if(['hash','tokenize','encrypt'].includes(t.kind))delete t.function;return {...source,transforms:[t]};};
  const param={name:'value',field,value:{string:'x'}};
  add('parameter-identity-refusal',!api.inspectProtectionCatalog(withTransform({parameters:[param,param]})).valid);
  add('parameter-32-positive',api.inspectProtectionCatalog(withTransform({parameters:Array.from({length:32},(_,i)=>({...param,name:String(i)}))})).valid);
  add('parameter-33-refusal',!api.inspectProtectionCatalog(withTransform({parameters:Array.from({length:33},(_,i)=>({...param,name:String(i)}))})).valid);
  for(const size of [4096,4097]){const value={string:'x'.repeat(size-JSON.stringify({string:''}).length)};add('literal-bound-'+size,api.inspectProtectionCatalog(withTransform({parameters:[{...param,value}]})).valid===(size===4096));}
  add('exact-integer-carrier',api.inspectProtectionCatalog(withTransform({parameters:[{...param,value:{integerToken:'9007199254740993'}}]})).valid);
  add('unknown-member-diagnostic',inspection.diagnostics.some((d:any)=>d.code==='PROTECTION_UNKNOWN'));
  add('prefix-positive',api.inspectProtectionCatalog(withTransform({disclosureProfile:[{kind:'prefix',length:2}]})).valid);
  add('prefix-zero-refusal',!api.inspectProtectionCatalog(withTransform({disclosureProfile:[{kind:'prefix',length:0}]})).valid);
  const custody={owner:'o',keyRef:'k',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'declared',snapshots:'declared',exports:'declared',feeds:'declared',caches:'declared'}};
  add('custody-shape-positive',api.inspectProtectionCatalog(withTransform({kind:'encrypt',custody})).valid);
  for(const member of ['history','snapshots','exports','feeds','caches']){const changed:any=structuredClone(custody);delete changed.propagation[member];add('custody-missing-'+member,!api.inspectProtectionCatalog(withTransform({kind:'encrypt',custody:changed})).valid);}
  add('vault-key-substitution-refused',!api.inspectProtectionCatalog(withTransform({kind:'tokenize',custody,reversibility:'vault',reverseAction:'reverse'})).valid);
  const oversized={...source,native:{opaque:'x'.repeat(4_000_001)}};const bounded=api.inspectProtectionCatalog(oversized);add('source-text-ledger-refusal',bounded.valid===false&&bounded.diagnostics[0]?.code==='PROTECTION_BOUND'&&bounded.source.native.opaque===oversized.native.opaque);
  add('host-globals-absent',['Bun','process','Buffer','Deno'].every(key=>!(key in globalThis)));
  return rows;
 });
 const after=await pins();if(external||observations.some(x=>x.expected!==x.observed)||JSON.stringify(before)!==JSON.stringify(after))throw Error('Catalog browser replay failed');
 const receipt={status:'catalog-wire-component-passed',chromium:browser.version(),bun:Bun.version,observations,externalRequests:external,sourceDigests:after,bundleSha256:hash(js),acceptanceCasesPromoted:[],scope:'Wire shapes and local bounds only; interpretation always refuses. No core domain closure, query/function semantics, verified custody, policy0.2 or native enforcement qualification.'};
 await Bun.write('docs/helix/04-build/evidence/security/protection-wire-20261015/browser.json',JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:receipt.status,controls:observations.length,chromium:receipt.chromium}));
}finally{await browser?.close();server.stop(true);}

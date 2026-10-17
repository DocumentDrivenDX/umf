/** Actual Chromium parity for the portable generator; host code stays here. */
import {chromium} from 'playwright';
import {generateAccessPackage} from '../src/compilation/index';
import {profile,request,mutateSource} from '../tests/compilation/access-fixtures';
const out=process.argv[2];if(!out)throw new Error('temporary output directory required');
const bundle=await Bun.build({entrypoints:[new URL('../src/compilation/index.ts',import.meta.url).pathname],target:'browser',format:'esm',outdir:out});
if(!bundle.success)throw new Error(bundle.logs.join('\n'));
const modulePath=bundle.outputs[0]!.path;
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const path=new URL(req.url).pathname;return path==='/bundle.js'?new Response(Bun.file(modulePath),{headers:{'content-type':'text/javascript'}}):new Response('<script type="module">import * as api from "/bundle.js";window.api=api;</script>',{headers:{'content-type':'text/html'}});}});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);await page.waitForFunction(()=>!!(window as any).api);
 const joined=request();joined.records.push({module:'commerce',element:'Customer'});joined.projections=[{name:'orderCustomer',record:joined.records[0]!,fields:[{module:'commerce',element:'orderId'},{module:'commerce',element:'name'}]}];
 mutateSource(joined,d=>{for(const e of d.modules[0]!.elements)Object.assign(e,{name:e.id});Object.assign(d.modules[0]!,{relationships:[{id:'customer',name:'customer',source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:'Customer',key:'Customer-key'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true}]});});
 const unreachable=structuredClone(joined);mutateSource(unreachable,d=>Object.assign(d.modules[0]!,{relationships:[]}));
 const base=request();
 const navigation=structuredClone(joined);mutateSource(navigation,d=>{
  const customer=d.modules[0]!.elements.find(e=>e.id==='Customer')! as any;
  customer.keys.push({id:'customer-name-key',name:'Customer name identity',fields:[{module:'commerce',element:'name'}]});
  (d.modules[0] as any).relationships[0].target[0].key='customer-name-key';
  const access=d.modules[0]!.extensions!['umf.access'] as any;
  access.views.find((v:any)=>v.record.element==='Customer').fields.find((f:any)=>f.field.element==='name').mutable=false;
 });
 const requiredNavigation=structuredClone(navigation);mutateSource(requiredNavigation,d=>{(d.modules[0] as any).relationships[0].targetMultiplicity.min=1;});
 const selfNavigation=structuredClone(base);mutateSource(selfNavigation,d=>{
  for(const element of d.modules[0]!.elements)Object.assign(element,{name:element.id});
  Object.assign(d.modules[0]!,{relationships:[{id:'parent',name:'parent',source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:'Order',key:'order-key'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true}]});
 });
 const search=request();search.package='search_docs';search.sources=[{id:'logical',format:'json',text:await Bun.file('fixtures/access/search/model.json').text()}];search.records=[{module:'search',element:'Doc'}];search.actions=[];search.projections=[{name:'docSummary',record:search.records[0]!,fields:[{module:'search',element:'id'},{module:'search',element:'body'}]}];
 const badSearch=structuredClone(search);mutateSource(badSearch,d=>{const payload=d.modules[0]!.extensions!['umf.access'] as any;payload.search[0].keyword.syntax='operators';});
 const native=request();const nativeRequest=JSON.parse(await Bun.file('fixtures/access/native-actions/request.json').text());native.sources=[{id:'logical',format:'json',text:nativeRequest.binding.modelJson}];native.records=[{module:'sales',element:'order'}];native.projections=[];native.names=[];native.actions=[{module:'sales',action:'approve'},{module:'sales',action:'createOrder'}];
 const nativeBinding=await Bun.file('fixtures/access/native-actions/physical-binding.json').text();
 if(nativeRequest.binding.nativeColumns.sets[0].binding.documentJson!==nativeBinding)throw Error('native browser fixture original binding source differs');
 native.sources.push({id:'native-action-original-columns',format:'json',text:nativeBinding});native.bindings=['native-action-original-columns'];
 const many=request();many.package='many_keys';many.sources=[{id:'logical',format:'json',text:await Bun.file('tests/compilation/fixtures/many-navigation.json').text()}];many.records=[{module:'sales',element:'order'},{module:'sales',element:'customer'}];
 const manyCollision=structuredClone(many);const manyDoc=JSON.parse(many.sources[0]!.text);manyCollision.names=[{sourceId:'logical',pointer:`/modules/0/elements/${manyDoc.modules[0].elements.findIndex((e:any)=>e.id==='order')}`,python:'ManyNavigation'}];
 const nativeCollation=request();nativeCollation.sources=[{id:'logical',format:'json',text:await Bun.file('fixtures/access/commerce/postgresql18.json').text()},{id:'orders-binding',format:'json',text:await Bun.file('fixtures/access/commerce/postgresql18-binding.json').text()}];nativeCollation.bindings=['orders-binding'];
 mutateSource(nativeCollation,d=>{for(const column of (d.modules[0]!.extensions!['umf.access'] as any).columns[0].columns)column.collation=column.type==='text'?{schema:'pg_catalog',name:'default'}:null;});
 const longCollation=structuredClone(nativeCollation);mutateSource(longCollation,d=>{(d.modules[0]!.extensions!['umf.access'] as any).columns[0].columns[0].collation.name='é'.repeat(32);});
 const unknownCollation=structuredClone(nativeCollation);mutateSource(unknownCollation,d=>{(d.modules[0]!.extensions!['umf.access'] as any).columns[0].columns[0].collation.meaning='uninterpreted';});
 const cases=[joined,unreachable,base,navigation,requiredNavigation,selfNavigation,search,badSearch,native,many,manyCollision,nativeCollation,longCollation,unknownCollation];
 const observations:unknown[]=[];const identities:unknown[]=[];const sha=(value:string|ArrayBuffer)=>new Bun.CryptoHasher('sha256').update(value).digest('hex');
 for(const req of cases){
  const p=profile(),expected=generateAccessPackage(req,p);
  if(JSON.stringify(generateAccessPackage(req,p))!==JSON.stringify(expected))throw new Error('Bun generator is not deterministic');
  if([search,native,navigation,requiredNavigation,selfNavigation,many,nativeCollation].includes(req)&&expected.outcome!=='candidate')throw new Error(JSON.stringify(expected.diagnostics));
  if(req===longCollation&&(expected.outcome!=='refused'||!expected.diagnostics.some(d=>d.accessCode==='ACCESS_SHAPE')))throw Error('UTF-8 collation name bound was not refused');
  if(req===unknownCollation&&(expected.outcome!=='refused'||!expected.diagnostics.some(d=>d.code==='UNKNOWN_RELEVANT'&&d.pointer.endsWith('/collation/meaning'))))throw Error('unknown selected collation meaning was not retained/refused');
  const fields=expected.files.find(file=>file.path.endsWith('/fields.py'))?.text??'';
  if(req===navigation&&(!fields.includes('OptionalNavigation[')||!fields.includes('customer-name-key')||!fields.includes('Customer-key')))throw new Error('alternate relationship Key or selected target Key metadata omitted');
  if(req===many&&!fields.includes('ManyNavigation[Order, Customer, OrderKey, CustomerKey, CustomerPkKey, OrderPkKey]'))throw Error('many navigation selected/original Key phantoms omitted');
  if(req===manyCollision&&(expected.outcome!=='refused'||expected.files.length!==0||!expected.diagnostics.some(d=>d.code==='NAME')))throw Error('many navigation import collision was not refused');
  if(req===requiredNavigation&&!fields.includes('RequiredNavigation['))throw new Error('required navigation metadata omitted');
  if(req===selfNavigation&&(!fields.includes('RecordAlias')||!fields.includes('OptionalNavigation[')))throw new Error('self-alias/refinement navigation metadata omitted');
  if(req===search&&(!fields.includes('DocSelectedQuery')||!fields.includes('DocSummary')||!fields.includes('RANKED_MODEL_PROFILE')))throw new Error('ranked selected/projection family metadata omitted');
  const actual=await page.evaluate(({req,p})=>(window as any).api.generateAccessPackage(req,p),{req,p});
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('browser generator differs from Bun');
  const repeated=await page.evaluate(({req,p})=>(window as any).api.generateAccessPackage(req,p),{req,p});
  if(JSON.stringify(repeated)!==JSON.stringify(actual))throw new Error('browser generator is not deterministic');
  observations.push({case:cases.indexOf(req),request:req,profile:p,outcome:expected.outcome,inputDigest:expected.inputDigest,expectedSha256:sha(JSON.stringify(expected)),actualSha256:sha(JSON.stringify(actual)),files:expected.files.map(file=>({path:file.path,sha256:sha(file.text)}))});
 }
 // Independently perturb each input identity dimension in the real browser.
 const originalProfile=profile(),original=generateAccessPackage(base,originalProfile);
 for(const dimension of ['source','metadata','code'] as const){
  const req=structuredClone(base),p=structuredClone(originalProfile);
  if(dimension==='source')req.sources[0]!.text+='\n';
  else if(dimension==='metadata')p.subset+='x';
  else p.codeSha256=(p.codeSha256[0]==='a'?'b':'a')+p.codeSha256.slice(1);
  const expected=generateAccessPackage(req,p);
  const actual=await page.evaluate(({req,p})=>(window as any).api.generateAccessPackage(req,p),{req,p});
  if(expected.inputDigest===original.inputDigest||JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('browser identity perturbation failed: '+dimension);
  identities.push({dimension,originalInputDigest:original.inputDigest,inputDigest:expected.inputDigest,expectedSha256:sha(JSON.stringify(expected)),actualSha256:sha(JSON.stringify(actual))});
 }
 const sources:{path:string;sha256:string}[]=[];
 for(const pattern of ['src/**/*.ts','spec/**/*.json'])for(const path of new Bun.Glob(pattern).scanSync({cwd:process.cwd(),onlyFiles:true}))sources.push({path,sha256:sha(await Bun.file(path).arrayBuffer())});
 sources.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const result={browser:browser.version(),bun:Bun.version,cases:cases.length,repeatedRunsPerHost:2,identityPerturbations:3,byteEquivalentPackages:true,observations,identities,sources,bundleSha256:sha(await Bun.file(modulePath).arrayBuffer()),harnessSha256:sha(await Bun.file(import.meta.path).arrayBuffer()),temporalQualification:'HELD'};
 await Bun.write(`${out}/browser-receipt.json`,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({browser:result.browser,bun:result.bun,cases:result.cases,repeatedRunsPerHost:2,identityPerturbations:3,byteEquivalentPackages:true,receipt:`${out}/browser-receipt.json`}));
}finally{await browser.close();server.stop(true);}

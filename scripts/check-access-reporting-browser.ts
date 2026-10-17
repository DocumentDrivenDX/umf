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
 const search=request();search.package='search_docs';search.sources=[{id:'logical',format:'json',text:await Bun.file('fixtures/access/search/model.json').text()}];search.records=[{module:'search',element:'Doc'}];search.actions=[];search.projections=[];
 const badSearch=structuredClone(search);mutateSource(badSearch,d=>{const payload=d.modules[0]!.extensions!['umf.access'] as any;payload.search[0].keyword.syntax='operators';});
 const native=request();const nativeRequest=JSON.parse(await Bun.file('fixtures/access/native-actions/request.json').text());native.sources=[{id:'logical',format:'json',text:nativeRequest.binding.modelJson}];native.records=[{module:'sales',element:'order'}];native.projections=[];native.names=[];native.actions=[{module:'sales',action:'approve'},{module:'sales',action:'createOrder'}];
 const cases=[joined,unreachable,base,search,badSearch,native];
 for(const req of cases){
  const p=profile(),expected=generateAccessPackage(req,p);
  if(JSON.stringify(generateAccessPackage(req,p))!==JSON.stringify(expected))throw new Error('Bun generator is not deterministic');
  if((req===search||req===native)&&expected.outcome!=='candidate')throw new Error(JSON.stringify(expected.diagnostics));
  const actual=await page.evaluate(({req,p})=>(window as any).api.generateAccessPackage(req,p),{req,p});
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('browser generator differs from Bun');
  const repeated=await page.evaluate(({req,p})=>(window as any).api.generateAccessPackage(req,p),{req,p});
  if(JSON.stringify(repeated)!==JSON.stringify(actual))throw new Error('browser generator is not deterministic');
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
 }
 console.log(JSON.stringify({browser:browser.version(),cases:cases.length,repeatedRunsPerHost:2,identityPerturbations:3,byteEquivalentPackages:true}));
}finally{await browser.close();server.stop(true);}

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {schemaPropertiesCases,schemaPropertiesFixture} from './core-schema-properties-cases';
import {validateDocument} from '../src/index';
const bundle=await Bun.file('dist/umf.js').text();
const cases=schemaPropertiesCases().map(row=>({...row,expected:validateDocument(row.document)}));
const fixture=schemaPropertiesFixture();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(bundle,{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json({cases,fixture});return new Response('<!doctype html><html><body>Core schema properties</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const url='/umf.js',u=await import(url),{cases,fixture}=await(await fetch('/cases')).json();
  const same=(a:any,b:any)=>{if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Browser parity mismatch');};
  let refusals=0,recoveries=0;const refuses=(fn:()=>unknown)=>{let failed=false;try{fn();}catch{failed=true;}if(!failed)throw Error('Expected refusal');refusals++;};
  for(const row of cases){same(u.validateDocument(row.document),row.expected);if(row.expected.valid!==row.valid)throw Error('Wrong case result');}
  const identity={scope:'element',module:'m',element:'quantity'},field={module:'m',element:'quantity'},before=JSON.stringify(fixture);
  const declared=u.declareCoreSchemaProperties(fixture,identity,{title:'Count',aliases:['count']});
  if(JSON.stringify(fixture)!==before||declared.target.modules[0].elements[0].title!=='Count')throw Error('Copy/authoring failure');
  same(u.verifyCoreSchemaPropertyDeclaration(declared,declared.target),declared);
  if(u.inspectCoreSchemaProperties(declared.target,identity).properties.title!=='Count')throw Error('Inspection failure');
  for(const format of ['json','yaml']){same(u.readDocument(u.writeDocument(declared.target,format),format),declared.target);same(u.verifyCoreSchemaPropertyDeclaration(u.readJsonValue(u.writeJsonValue(declared,format),format),declared.target),declared);recoveries+=2;}
  if(!u.resolveCoreDefault(fixture,field,{state:'missing'}).applied)throw Error('Missing default failure');
  if(u.resolveCoreDefault(fixture,field,{state:'present',value:{integerToken:'2'}}).applied)throw Error('Unexpected default');
  refuses(()=>u.resolveCoreDefault(fixture,field,{state:'present',value:null}));
  if(!u.resolveCoreDefault(fixture,{module:'m',element:'price'},{state:'present',value:null}).applied)throw Error('Null default failure');
  if(!u.validateCoreFieldValue(fixture,{module:'m',element:'price'},{decimalToken:'999999999999999999.99'}).valid)throw Error('Exact decimal failure');
  if(u.validateCoreFieldValue(fixture,field,{integerToken:'1.5'}).valid)throw Error('Fractional integer accepted');
  const selection=u.selectCoreElements(fixture,{references:'transitive',identities:[{module:'m',element:'vector'}],cardinalities:['array']});same(u.verifyCoreElementSelection(selection),selection);if(selection.selection.length!==2)throw Error('Item selection failure');
  const forged=structuredClone(declared);forged.provenance.path='/forged';refuses(()=>u.verifyCoreSchemaPropertyDeclaration(forged,declared.target));
  const old={umf:'0.7.0',id:'legacy',title:{unknown:true},vocabularies:{},modules:[{id:'m',namespace:'n',elements:[{id:'f',kind:'field',scalarType:'string',extensions:{},default:'opaque',facets:{length:{max:3,unit:'unicode-scalar',min:'opaque'}}}]}]};
  const upgrade=u.upgradeSchemaPropertiesEnvelope(old);if(upgrade.residuals.length!==3)throw Error('Collision archive failure');same(u.verifySchemaPropertiesUpgrade(upgrade),upgrade);
  const current=u.declareCoreSchemaProperties(upgrade.target,{scope:'element',module:'m',element:'f'},{title:'New'}).target,rollback=u.rollbackSchemaPropertiesEnvelope(upgrade,current);same(rollback.target,old);same(rollback.source,current);
  for(const format of ['json','yaml']){same(u.verifySchemaPropertiesUpgrade(u.readJsonValue(u.writeJsonValue(upgrade,format),format)),upgrade);recoveries++;}
  let getterCalls=0;const request={};Object.defineProperty(request,'title',{enumerable:true,get(){getterCalls++;return 'bad';}});refuses(()=>u.declareCoreSchemaProperties(fixture,{scope:'document'},request));
  const hostileIdentity={module:'m',element:'quantity'};
  Object.defineProperty(hostileIdentity,'module',{enumerable:true,get(){getterCalls++;return 'm';}});
  if(u.validateCoreFieldValue(fixture,hostileIdentity,{integerToken:'1'}).valid)throw Error('Identity accessor accepted');
  refuses(()=>u.resolveCoreDefault(fixture,hostileIdentity,{state:'missing'}));
  for(const facets of [null,false,0,''])refuses(()=>u.declareCoreSchemaProperties(fixture,identity,{facets}));
  const extensionDoc=structuredClone(fixture),id='fixture.context';extensionDoc.vocabularies[id]={version:'1.0.0'};
  extensionDoc.extensions={[id]:{}};extensionDoc.modules[0].extensions={[id]:{}};extensionDoc.modules[0].elements[1].extensions={[id]:{}};
  let extensionChecks=0;
  const registry=new u.Registry().register({id,version:'1.0.0',coreVersion:'0.1.0',description:'Context regression',schema:{type:'object'},semantics:'Synthetic context check',scopes:['document','module','element'],capabilities:{validation:'semantic',directions:[],evidence:[]}},(_payload:any,context:any)=>{
   if(context.document.umf!=='0.8.0'||context.document.title!=='Orders'||!context.document.modules[0].elements[1].facets.range)throw Error('Stripped extension context');
   extensionChecks++;context.document.title='private copy';return [{code:'RANGE_POLICY',path:context.path,message:'Declared range refused',severity:'error'}];
  });
  const validation=u.validateDocument(extensionDoc,registry);
  if(validation.valid||validation.diagnostics.filter((d:any)=>d.code==='RANGE_POLICY').length!==3||extensionChecks!==3||extensionDoc.title!=='Orders')throw Error('Extension policy/copy failure');
  refuses(()=>u.selectCoreElements(extensionDoc,{references:'none',identities:[]},registry));
  if(getterCalls||'Bun'in globalThis||'process'in globalThis)throw Error('Host/getter leak');
  return {cases:cases.length,recoveries,refusals,getterCalls,extensionChecks};
 });
 assert.equal(checks.cases,cases.length);assert.equal(checks.recoveries,6);assert.deepEqual(externalRequests,[]);
 const paths=['src/model/selection.ts','src/model/selection-verification.ts','src/model/schema-properties-receipts.ts','spec/core/schema-properties-receipt.schema.json','spec/core/schema-properties-selection.schema.json','src/model/schema-literals.ts','src/model/schema-properties.ts','src/model/schema-properties-transition.ts','src/validation/schema-properties.ts','src/validation/document.ts','src/model/types.ts','src/index.ts','spec/core/schema-properties-document.schema.json','scripts/core-schema-properties-browser.ts','scripts/core-schema-properties-cases.ts','tests/core/schema-properties.test.ts','tests/core/schema-properties-review.test.ts'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/core-schema-properties-browser.json',JSON.stringify({scope:'Experimental core 0.8.0 validation, public authoring/default operations and retained migration; native bindings/admission not claimed',browser:browser.version(),checks,externalRequests,bundleSha256:createHash('sha256').update(bundle).digest('hex'),sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}

import {chromium} from 'playwright';
import {validateDocument} from '../src/validation/document';
const cases:unknown[]=[];
for(const umf of ['0.1.0','0.2.0','0.3.0'])for(const kind of ['field','record','group','future-kind',undefined])for(const nullability of ['required','absent-allowed','unspecified','future-availability',null,42,{},[],undefined,'']){
 cases.push({umf,id:'availability-'+cases.length,vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[{id:'e',extensions:{future:{is_nullable:true,default:null,unknown:[1,'雪']}},...(kind===undefined?{}:{kind}),...(nullability===undefined?{}:{nullability})}]}]});
}
const expected=cases.map(c=>validateDocument(c));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json({cases,expected});return new Response('<!doctype html><html><body>Nullability envelope checks</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),{cases,expected}=await(await fetch('/cases')).json();let recoveries=0,legacyCollisions=0,refusals=0,transitions=0,tamperedReceipts=0,inspections=0,authorDeclarations=0;
  if(u.coreNullabilitySchema.$id!=='urn:umf:core:0.3.0'||JSON.stringify(u.NULLABILITIES)!==JSON.stringify(['required','absent-allowed','unspecified']))throw Error('Public nullability metadata');
  for(let i=0;i<cases.length;i++){
   const source=cases[i],result=u.validateDocument(source);if(JSON.stringify(result)!==JSON.stringify(expected[i]))throw Error('Validation parity '+i);
   if(!result.valid){refusals++;continue;}
   const inspected=u.inspectCoreNullability(source,{module:'m',element:'e'}),element=source.modules[0].elements[0];
   const expectedState=Object.hasOwn(element,'nullability')?(source.umf!=='0.3.0'?'legacy':u.NULLABILITIES.includes(element.nullability)?'known':'unknown'):(source.umf==='0.3.0'&&element.kind!=='field'?'inapplicable':'missing');
   if(inspected.meaning.state!==expectedState||inspected.provenance!=='unverified')throw Error('Availability inspection');inspections++;
   if(source.umf!=='0.3.0'&&Object.hasOwn(source.modules[0].elements[0],'nullability')){
    if(!result.diagnostics.some((d:any)=>d.code==='UNKNOWN_CORE_FIELD'&&d.path==='/modules/0/elements/0/nullability'))throw Error('Legacy interpretation');legacyCollisions++;
   }
   if(source.umf==='0.2.0')for(const format of ['json','yaml']){
    const upgraded=u.upgradeNullabilityEnvelope(source);
    if(Object.hasOwn(upgraded.target.modules[0].elements[0],'nullability'))throw Error('Legacy availability interpreted');
    const receipt=u.readJsonValue(u.writeJsonValue(upgraded,format),format),current=u.copyJson(receipt.target);
    if(current.modules[0].elements[0].kind==='field')for(const value of u.NULLABILITIES){
     const declaration=u.declareCoreNullability(receipt.target,{module:'m',element:'e'},value);
     const restored=u.readJsonValue(u.writeJsonValue(declaration,format),format);u.verifyCoreNullabilityDeclaration(restored,restored.target);authorDeclarations++;
     current.modules[0].elements[0].nullability=value;
     const stale=u.copyJson(restored.target);stale.future={changed:true};let rejected=false;try{u.verifyCoreNullabilityDeclaration(restored,stale);}catch{rejected=true;}if(!rejected)throw Error('Stale availability accepted');
    }
    current.modules[0].elements[0].extensions.future={edited:'retained'};
    const rollback=u.rollbackNullabilityEnvelope(receipt,current);
    if(JSON.stringify(rollback.target)!==JSON.stringify(source)||JSON.stringify(rollback.source)!==JSON.stringify(current))throw Error('Rollback loss');
    transitions++;
    receipt.target.id='forged';let rejected=false;try{u.rollbackNullabilityEnvelope(receipt,current);}catch{rejected=true;}
    if(!rejected)throw Error('Forged migration accepted');tamperedReceipts++;
   }
   for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(source,format),format);if(JSON.stringify(back)!==JSON.stringify(source))throw Error('Changed meaning or native content');recoveries++;}
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {decisions:cases.length,recoveries,legacyCollisions,refusals,transitions,tamperedReceipts,inspections,authorDeclarations};
 });
 if(external.length)throw Error('External requests');const result={scope:'Experimental nullability envelope, typed inspection/authoring, explicit migration/rollback and JSON/YAML preservation; native bindings remain pending',browser:browser.version(),checks,externalRequests:external};
 await Bun.write('fixtures/validation/core-nullability-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

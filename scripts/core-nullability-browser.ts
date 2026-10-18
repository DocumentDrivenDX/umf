import {chromium} from 'playwright';
import {CURRENT_CORE_VERSION} from '../src/model/types';
import {validateDocument} from '../src/validation/document';
const cases:unknown[]=[];
for(const kind of ['field','record','group','future-kind',undefined])for(const nullability of ['required','absent-allowed','unspecified','future-availability',null,42,{},[],undefined,'']){
 const umf=CURRENT_CORE_VERSION;
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
  const path='/umf.js',u=await import(path),{cases,expected}=await(await fetch('/cases')).json();let recoveries=0,refusals=0,inspections=0,authorDeclarations=0,retiredRefusals=0;
  if(JSON.stringify(u.NULLABILITIES)!==JSON.stringify(['required','absent-allowed','unspecified']))throw Error('Public nullability metadata');
  for(let i=0;i<cases.length;i++){
   const source=cases[i],result=u.validateDocument(source);if(JSON.stringify(result)!==JSON.stringify(expected[i]))throw Error('Validation parity '+i);
   if(!result.valid){refusals++;continue;}
   const inspected=u.inspectCoreNullability(source,{module:'m',element:'e'}),element=source.modules[0].elements[0];
   const expectedState=Object.hasOwn(element,'nullability')?(u.NULLABILITIES.includes(element.nullability)?'known':'unknown'):(element.kind==='field'?'missing':'inapplicable');
   if(inspected.meaning.state!==expectedState||inspected.provenance!=='unverified')throw Error('Availability inspection');inspections++;
   if(source.modules[0].elements[0].kind==='field'&&['required','absent-allowed','unspecified'].includes(source.modules[0].elements[0].nullability)){const declared=u.declareCoreNullability(source,{module:'m',element:'e'},source.modules[0].elements[0].nullability);u.verifyCoreNullabilityDeclaration(declared,declared.target);authorDeclarations++;}
   for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(source,format),format);if(JSON.stringify(back)!==JSON.stringify(source))throw Error('Changed meaning or native content');recoveries++;}
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  const retired=u.copyJson(cases[0]);retired.umf='0.2.0';if(u.validateDocument(retired).valid)throw Error('Retired core marker accepted');retiredRefusals++;if(retiredRefusals!==1)throw Error('Retired core marker accepted');
  return {decisions:cases.length,recoveries,refusals,inspections,authorDeclarations,retiredRefusals};
 });
 if(external.length)throw Error('External requests');const result={scope:'Current core availability validation, typed inspection/authoring, retired-marker refusal, and JSON/YAML preservation; native bindings remain pending',browser:browser.version(),checks,externalRequests:external};
 await Bun.write('fixtures/validation/core-nullability-current-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

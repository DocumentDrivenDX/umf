import {chromium} from 'playwright';
import {CURRENT_CORE_VERSION} from '../src/model/types';
import {validateDocument} from '../src/validation/document';
const cases:unknown[]=[];
for(const kind of ['field','record','group','future-kind',null,42,{},[],undefined,''])for(const scalar of [false,true]){
 const umf=CURRENT_CORE_VERSION;
 cases.push({umf,id:'case-'+cases.length,vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[{id:'e',extensions:{future:{opaque:[null,'雪',42]}},...(kind===undefined?{}:{kind}),...(scalar?{scalarType:'string'}:{})}]}]});
}
const expected=cases.map(validate=>validateDocument(validate));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json({cases,expected});return new Response('<!doctype html><html><body>Field version validation</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();const external:string[]=[];
 page.on('request',request=>{if(!request.url().startsWith(`http://127.0.0.1:${server.port}/`))external.push(request.url());});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js';const umf=await import(path);const {cases,expected}=await(await fetch('/cases')).json();let recoveries=0,kindLookups=0,authorDeclarations=0,retiredRefusals=0;
  for(let i=0;i<cases.length;i++){
   const result=umf.validateDocument(cases[i]);if(JSON.stringify(result)!==JSON.stringify(expected[i]))throw Error('Host parity '+i);
   if(result.valid){
    const lookup=umf.inspectCoreElementKind(cases[i],{module:'m',element:'e'});
    const element=cases[i].modules[0].elements[0];
    const expectedState=!Object.hasOwn(element,'kind')?'unspecified':['field','record','group'].includes(element.kind)?'known':'unknown';
    if(lookup.meaning.state!==expectedState||lookup.provenance!=='unverified')throw Error('Kind interpretation '+i);
    kindLookups++;
   }
   if(result.valid&&cases[i].modules[0].elements[0].kind==='field'){const authored=umf.declareCoreElementKind(cases[i],{module:'m',element:'e'},'field');umf.verifyCoreKindDeclaration(authored,authored.target);authorDeclarations++;}
   if(result.valid)for(const format of ['json','yaml']){const back=umf.readDocument(umf.writeDocument(cases[i],format),format);if(JSON.stringify(back)!==JSON.stringify(cases[i]))throw Error('Recovery '+i);recoveries++;}
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  const retired=umf.copyJson(cases[0]);retired.umf='0.8.0';if(umf.validateDocument(retired).valid)throw Error('Retired core marker accepted');retiredRefusals++;if(retiredRefusals!==1)throw Error('Retired core marker accepted');
  return {decisions:cases.length,recoveries,kindLookups,authorDeclarations,retiredRefusals,hostGlobalsAbsent:true};
 });
 if(external.length)throw Error('Unexpected external requests');
 const result={scope:'Current core field validation, typed kind inspection/authoring, retired-marker refusal and JSON/YAML preservation; no native classification or binding claim',browser:browser.version(),checks,externalRequests:external};
 await Bun.write('fixtures/validation/core-field-current-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

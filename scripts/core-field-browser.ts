import {chromium} from 'playwright';
import {validateDocument} from '../src/validation/document';
const cases:unknown[]=[];
for(const umf of ['0.1.0','0.2.0'])for(const kind of ['field','record','group','future-kind',null,42,{},[],undefined,''])for(const scalar of [false,true]){
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
  const path='/umf.js';const umf=await import(path);const {cases,expected}=await(await fetch('/cases')).json();let recoveries=0,transitions=0;
  for(let i=0;i<cases.length;i++){
   const result=umf.validateDocument(cases[i]);if(JSON.stringify(result)!==JSON.stringify(expected[i]))throw Error('Host parity '+i);
   if(result.valid&&cases[i].umf==='0.1.0')for(const format of ['json','yaml']){
    const receipt=umf.upgradeFieldEnvelope(cases[i]);
    const decoded=umf.readJsonValue(umf.writeJsonValue(receipt,format),format);
    const current=umf.copyJson(decoded.target);current.modules[0].elements[0].kind='field';
    current.modules[0].elements[0].extensions.future={edited:'retained'};
    const rollback=umf.rollbackFieldEnvelope(decoded,current);
    if(JSON.stringify(rollback.target)!==JSON.stringify(cases[i])||JSON.stringify(rollback.source)!==JSON.stringify(current))throw Error('Transition recovery '+i);
    const altered=umf.copyJson(decoded);altered.target.id='stale';let refused=false;
    try{umf.rollbackFieldEnvelope(altered,current);}catch{refused=true;}if(!refused)throw Error('Stale receipt accepted');
    transitions++;
   }
   if(result.valid)for(const format of ['json','yaml']){const back=umf.readDocument(umf.writeDocument(cases[i],format),format);if(JSON.stringify(back)!==JSON.stringify(cases[i]))throw Error('Recovery '+i);recoveries++;}
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');
  return {decisions:cases.length,recoveries,transitions,hostGlobalsAbsent:true};
 });
 if(external.length)throw Error('Unexpected external requests');
 const result={scope:'Experimental Field envelope validation and legacy collision recovery only; explicit migration/rollback; no provenance or native binding claim',browser:browser.version(),checks,externalRequests:external};
 await Bun.write('fixtures/validation/core-field-browser.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

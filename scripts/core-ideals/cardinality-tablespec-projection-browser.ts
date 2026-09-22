import {chromium} from 'playwright';
import {cardinalityTableSpecProjectionCases} from './cardinality-tablespec-projection-cases';
import * as u from '../../src';
const rows=cardinalityTableSpecProjectionCases().map(row=>({...row,result:u.projectCardinalityToTableSpec(row.author,row.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>Cardinality TableSpec projection</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,blocks=0,tampered=0;
  if(u.cardinalityTableSpecProjectionSchema.$id!=='urn:umf:core:cardinality-tablespec-projection:1.0.0')throw Error('Public schema missing');
  for(const row of rows){
   const result=u.projectCardinalityToTableSpec(row.author,row.request);if(JSON.stringify(result)!==JSON.stringify(row.result)||result.status!==row.expectedStatus)throw Error('Browser projection mismatch');
   if(result.status==='blocked'){if(result.target||!result.residuals.length)throw Error('Non-atomic refusal');blocks++;continue;}
   const text=u.exportTableSpec(result.target);
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);const back=u.recoverCardinalityFromTableSpec(receipt,text);if(JSON.stringify(back)!==JSON.stringify(row.author.target))throw Error('Ideal recovery lost meaning');recoveries++;}
   const changed=u.copyJson(result);changed.mapping.idealPath+='/forged';let refused=false;try{u.recoverCardinalityFromTableSpec(changed,text);}catch{refused=true;}if(!refused)throw Error('Forged receipt');tampered++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,recoveries,blocks,tampered};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/cardinality-tablespec-projection-browser.json',JSON.stringify({scope:'Explicit native carrier projection with retained ideal recovery; no implicit map encoding or complete binding acceptance',browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}

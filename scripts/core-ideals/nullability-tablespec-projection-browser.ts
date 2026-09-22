import {chromium} from 'playwright';
import {nullabilityTableSpecProjectionCases} from './nullability-tablespec-projection-cases';
import {projectNullabilityToTableSpec} from '../../src';
const rows=nullabilityTableSpecProjectionCases().map(row=>({...row,result:projectNullabilityToTableSpec(row.author,row.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>TableSpec authored availability</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,blocks=0,tampered=0;
  if(u.nullabilityTableSpecProjectionSchema.$id!=='urn:umf:core:nullability-tablespec-projection:1.0.0')throw Error('Public schema');
  for(const row of rows){const result=u.projectNullabilityToTableSpec(row.author,row.request);if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Bun/browser parity');
   if(result.status==='blocked'){if(result.target)throw Error('Partial target');blocks++;continue;}
   const native=u.exportTableSpec(result.target);
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);if(JSON.stringify(u.recoverNullabilityFromTableSpec(receipt,native))!==JSON.stringify(row.author.target))throw Error('Ideal recovery');recoveries++;}
   const changed=u.copyJson(result);changed.mapping.context='forged';let rejected=false;try{u.recoverNullabilityFromTableSpec(changed,native);}catch{rejected=true;}if(!rejected)throw Error('Forged context');tampered++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,recoveries,blocks,tampered};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/nullability-tablespec-projection-browser.json',JSON.stringify({scope:'Authored availability projection and ideal receipt recovery; no row execution claim',browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}

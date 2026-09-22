import {chromium} from 'playwright';
import {cardinalityTableSpecCases} from './cardinality-tablespec-cases';
import {classifyTableSpecCardinality} from '../../src';
const rows=cardinalityTableSpecCases().map(row=>({...row,result:classifyTableSpecCardinality(row.source,row.request)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>TableSpec Cardinality classification</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,blocks=0,tampered=0;
  if(u.tableSpecCardinalityClassificationSchema.$id!=='urn:umf:core:tablespec-cardinality-classification:1.0.0')throw Error('Public schema');
  for(const row of rows){
   const result=u.classifyTableSpecCardinality(row.source,row.request);if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Bun/browser parity');
   if(result.status==='blocked'){if(result.target)throw Error('Partial target');blocks++;continue;}
   const scope=result.target.modules[0].elements[0].extensions[u.TABLESPEC_CARDINALITY_EXTENSION];if(!scope||scope.profile!==row.request.profile)throw Error('Target lost binding scope');
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);u.verifyTableSpecCardinalityClassification(receipt,receipt.target);if(u.recoverTableSpecCardinalitySource(receipt,receipt.target)!==row.text)throw Error('Native recovery');recoveries++;}
   const changed=u.copyJson(result);changed.mapping.basis='forged';let rejected=false;try{u.verifyTableSpecCardinalityClassification(changed,changed.target);}catch{rejected=true;}if(!rejected)throw Error('Forged basis');tampered++;
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,recoveries,blocks,tampered};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/cardinality-tablespec-classification-browser.json',JSON.stringify({scope:'Declared column shape classification and exact native recovery; no down-projection or row enforcement claim',browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}

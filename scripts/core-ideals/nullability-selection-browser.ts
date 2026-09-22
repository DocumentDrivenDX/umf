import {chromium} from 'playwright';
import {nullabilitySelectionCases} from './nullability-selection-cases';
import {selectCoreElements} from '../../src/model/selection';
const rows=nullabilitySelectionCases().map(c=>({...c,result:selectCoreElements(c.source,c.query)}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(rows);return new Response('<!doctype html><html><body>Nullability selection</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0,refusals=0;
  if(u.coreNullabilitySelectionSchema.$id!=='urn:umf:core:element-selection:0.3.0')throw Error('Public report schema');
  for(const row of rows){const result=u.selectCoreElements(row.source,row.query);if(JSON.stringify(result)!==JSON.stringify(row.result))throw Error('Selection parity');
   for(const format of ['json','yaml']){const receipt=u.readJsonValue(u.writeJsonValue(result,format),format);if(JSON.stringify(u.verifyCoreElementSelection(receipt))!==JSON.stringify(result))throw Error('Report recovery');recoveries++;}
   const changed=u.copyJson(result);changed.sourceValidation.diagnostics=[];let rejected=false;try{u.verifyCoreElementSelection(changed);}catch{rejected=true;}if(!rejected)throw Error('Lost diagnostics');refusals++;
  }
  const source=rows[0].source;
  for(const [id,state] of [['missing','missing'],['unspecified','known'],['unknown','unknown']])if(u.inspectCoreNullability(source,{module:'sales',element:id}).meaning.state!==state)throw Error('Availability distinction');
  if(u.selectCoreElements(source,{identities:[{module:'sales',element:'required'}],references:'transitive'}).selection.length!==2)throw Error('Cycle/namespace identity');
  const legacy=u.copyJson(source);legacy.umf='0.2.0';legacy.modules[0].elements[1].nullability={opaque:true};const old=u.selectCoreElements(legacy,{references:'none'});u.verifyCoreElementSelection(old);if(u.inspectCoreNullability(legacy,{module:'sales',element:'required'}).meaning.state!=='legacy')throw Error('Legacy meaning changed');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,recoveries,refusals,legacyVerified:true};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/nullability-selection-browser.json',JSON.stringify({scope:'0.3.0 metadata selection and report verification; no native absence or provenance inference',browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}

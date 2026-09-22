import {chromium} from 'playwright';
const input=await Bun.file('fixtures/validation/nullability-tablespec-profile.json').json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(input.rows);return new Response('<!doctype html><html><body>TableSpec availability boundaries</body></html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),rows=await(await fetch('/cases')).json();let recoveries=0;
  for(const row of rows){
   const initial=u.importTableSpec(row.text,{id:row.case,format:row.nativeFormat}),field=u.classifyTableSpecField(u.upgradeFieldEnvelope(initial).target,{column:0,mode:'strict'}),model=u.upgradeNullabilityEnvelope(field.target).target;
   if(JSON.stringify(model)!==JSON.stringify(row.model))throw Error('Bun/browser parity');
   if(u.inspectCoreNullability(model,{module:'table',element:'column:0'}).meaning.state!=='missing')throw Error('Availability inferred');
   for(const format of ['json','yaml']){
    const restored=u.readDocument(u.writeDocument(model,format),format);if(u.exportTableSpec(restored)!==row.text)throw Error('Native source differs');
    if(JSON.stringify(u.getTableSpecColumn(restored,0))!==JSON.stringify(u.getTableSpecColumn(initial,0)))throw Error('Native nullable changed');recoveries++;
   }
  }
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:rows.length,recoveries,inferredAvailability:0};
 });
 if(external.length)throw Error('External requests');await Bun.write('fixtures/validation/nullability-tablespec-profile-browser.json',JSON.stringify({scope:'Native availability counterexample preservation through Field classification and Nullability migration; no native Nullability binding claim',browser:browser.version(),checks,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}

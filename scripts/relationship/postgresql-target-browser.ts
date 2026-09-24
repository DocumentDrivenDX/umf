import {chromium} from 'playwright';

const base='fixtures/projections/ddd-authored-relationships/';
const source=await Bun.file(base+'expected-postgresql-relationships.sql').text();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/postgresql-runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});
 if(path==='/source')return new Response(source,{headers:{'content-type':'text/plain'}});
 return new Response('<!doctype html><title>Expected relationship DDL</title>');
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async()=>{
  const umfPath='/umf.js',runtimePath='/postgresql-runtime.js';
  const umf=await import(umfPath),{backend}=await import(runtimePath),source=await(await fetch('/source')).text();
  const archive=await umf.importPostgresqlSql(source,backend,{id:'expected-relationship-target'});
  if(umf.getPostgresqlSource(archive)!==source)throw Error('Source changed');
  for(const format of ['json','yaml'])if(umf.getPostgresqlSource(umf.readDocument(umf.writeDocument(archive,format),format))!==source)throw Error('Archive codec changed');
  const deparsed=await umf.exportPostgresqlSql(archive,backend);
  if(!deparsed.includes('fk_order_products_product'))throw Error('Expected FK missing after deparse');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals in browser');
  return {sourceRecovered:true,foreignKeyDeparsed:true,archiveStatements:(source.match(/^(?:CREATE|ALTER) /gm)??[]).length};
 });
 if(external.length)throw Error('External browser request');
 await Bun.write(base+'expected-postgresql-browser.json',JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
 console.log({browser:browser.version(),...result});
}finally{await browser?.close();server.stop(true);}

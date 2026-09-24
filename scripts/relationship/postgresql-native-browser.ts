import {chromium} from 'playwright';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlSql} from '../../src';

const directory='fixtures/relationship/postgresql-native';
const source=await Bun.file(`${directory}/constraints.sql`).text();
const expected=await importPostgresqlSql(source,backend,{id:'relationship-native-observation'});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
  if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
  if(path==='/postgresql-runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});
  if(path==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});
  if(path==='/case')return Response.json({source,expected});
  return new Response('<!doctype html><html>PostgreSQL FK observations</html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage(),external:string[]=[];
  await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const result=await page.evaluate(async()=>{
    const modulePath='/umf.js',runtimePath='/postgresql-runtime.js',u=await import(modulePath),{backend}=await import(runtimePath),{source,expected}=await(await fetch('/case')).json();
    const archive=await u.importPostgresqlSql(source,backend,{id:'relationship-native-observation'});
    if(JSON.stringify(archive)!==JSON.stringify(expected))throw Error('Bun/Chromium native archive mismatch');
    if(u.getPostgresqlSource(archive)!==source)throw Error('Native source changed');
    const ddl=await u.exportPostgresqlSql(archive,backend);
    if((ddl.match(/FOREIGN KEY/g)??[]).length!==2)throw Error('Foreign keys lost by adapter');
    if(archive.modules.some((module:{relationships?:unknown})=>'relationships'in module))throw Error('Native evidence invented authored relationship');
    if('Bun'in globalThis||'process'in globalThis)throw Error('Host global in browser');
    return {nativeForeignKeys:2,sourceExact:true,authoredRelationships:0};
  });
  if(external.length)throw Error('External browser request');
  await Bun.write(`${directory}/browser.json`,JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

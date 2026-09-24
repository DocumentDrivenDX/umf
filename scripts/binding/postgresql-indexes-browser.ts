import {chromium} from 'playwright';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlSql,projectBindingIndexesToPostgresql,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/postgresql-indexes/case.json').json();
const native=await importPostgresqlSql(await Bun.file(fixture.native).text(),backend,{id:'native-table'});
const expected=await projectBindingIndexesToPostgresql(fixture.logical as Document,fixture.binding as Document,native,backend,'report');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
  if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
  if(path==='/postgresql-runtime.js')return new Response(Bun.file('dist/postgresql/runtime.js'),{headers:{'content-type':'text/javascript'}});
  if(path==='/libpg-query.wasm')return new Response(Bun.file('dist/postgresql/libpg-query.wasm'),{headers:{'content-type':'application/wasm'}});
  if(path==='/case')return Response.json({logical:fixture.logical,binding:fixture.binding,native,expected});
  return new Response('<!doctype html><html>PostgreSQL index binding</html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage(),external:string[]=[];
  await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const result=await page.evaluate(async()=>{
    const modulePath='/umf.js',runtimePath='/postgresql-runtime.js',u=await import(modulePath),{backend}=await import(runtimePath),f=await(await fetch('/case')).json();
    const report=await u.projectBindingIndexesToPostgresql(f.logical,f.binding,f.native,backend,'report');
    if(JSON.stringify(report)!==JSON.stringify(f.expected))throw Error('Bun/Chromium index DDL mismatch');
    const strict=await u.projectBindingIndexesToPostgresql(f.logical,f.binding,f.native,backend,'strict');
    if(strict.status!=='blocked'||strict.candidate)throw Error('Strict emitted partial candidate');
    if('Bun'in globalThis||'process'in globalThis)throw Error('Host global in browser');
    return {status:report.status,indexes:(report.candidate?.match(/CREATE (?:UNIQUE )?INDEX/g)??[]).length,residuals:report.residuals.length,strictBlocked:true};
  });
  if(external.length)throw Error('External browser request');
  await Bun.write('fixtures/binding/postgresql-indexes/browser.json',JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

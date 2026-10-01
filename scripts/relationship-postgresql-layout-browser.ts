import {chromium} from 'playwright';
import {postgresqlLayoutCases} from './relationship-postgresql-layout-cases';
import {validatePostgresqlRelationshipLayout} from '../src';
const cases=postgresqlLayoutCases().map(row=>({...row,report:validatePostgresqlRelationshipLayout(row.logical,row.binding,row.policy,'report'),strict:validatePostgresqlRelationshipLayout(row.logical,row.binding,row.policy,'strict')}));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});if(path==='/cases')return Response.json(cases);return new Response('<!doctype html><html>PostgreSQL endpoint policy</html>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async()=>{
  const path='/umf.js',u=await import(path),cases=await(await fetch('/cases')).json();let reported=0,blocked=0,recoveries=0;
  for(const row of cases){for(const mode of ['report','strict']){const r=u.validatePostgresqlRelationshipLayout(row.logical,row.binding,row.policy,mode);if(JSON.stringify(r)!==JSON.stringify(row[mode]))throw Error('Bun/Chromium mismatch '+row.id+'/'+mode);if(mode==='report'){if(r.status==='blocked')blocked++;else reported++;}if(JSON.stringify(r.logical)!==JSON.stringify(row.logical)||JSON.stringify(r.binding)!==JSON.stringify(row.binding)||JSON.stringify(r.policy)!==JSON.stringify(row.policy))throw Error('Retained source mismatch');if('nativeSource'in r||'targetArchive'in r)throw Error('Policy validator emitted native storage');recoveries+=3;}}
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host global');return {cases:cases.length,reported,blocked,strictBlocks:cases.length,retainedSourceComparisons:recoveries};
 });
 if(external.length)throw Error('External browser request');
 await Bun.write('fixtures/projections/postgresql-relationship-layout/browser.json',JSON.stringify({scope:'PostgreSQL 17.4 endpoint policy validation only; no emitted FK DDL or native enforcement claim',browser:browser.version(),result,externalRequests:external},null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

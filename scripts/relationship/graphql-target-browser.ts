import {chromium} from 'playwright';
import {importGraphqlSchema} from '../../src';

const base='fixtures/projections/ddd-authored-relationships/';
const source=await Bun.file(base+'expected-relationships.graphql').text();
const expected=importGraphqlSchema(source,{id:'expected-ddd-relationships',mode:'schema'});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
 if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/case')return Response.json({source,expected});
 return new Response('<!doctype html><title>Expected relationship SDL</title>');
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage(),external:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(`http://127.0.0.1:${server.port}/`);
 const result=await page.evaluate(async()=>{
  const path='/umf.js',umf=await import(path),{source,expected}=await(await fetch('/case')).json();
  const archive=umf.importGraphqlSchema(source,{id:'expected-ddd-relationships',mode:'schema'});
  if(JSON.stringify(archive)!==JSON.stringify(expected))throw Error('Bun/Chromium GraphQL archive mismatch');
  if(umf.exportGraphqlSchema(archive)!==source)throw Error('SDL source changed');
  for(const format of ['json','yaml'])if(umf.exportGraphqlSchema(umf.readDocument(umf.writeDocument(archive,format),format))!==source)throw Error('Codec source changed');
  if(archive.modules.some((module:any)=>Object.hasOwn(module,'relationships')))throw Error('SDL import invented author intent');
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals in browser');
  return {sourceRecovered:true,authoredRelationshipsInferred:0,relationshipFields:['Order.customer','Order.products','Customer.orders','Product.orders']};
 });
 if(external.length)throw Error('External browser request');
 await Bun.write(base+'expected-graphql-browser.json',JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
 console.log({browser:browser.version(),...result});
}finally{await browser?.close();server.stop(true);}

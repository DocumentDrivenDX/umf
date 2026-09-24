import {chromium} from 'playwright';
import {importGraphqlSchema} from '../../src';

const directory='fixtures/relationship/graphql-native';
const source=await Bun.file(`${directory}/schema.graphql`).text();
const expected=importGraphqlSchema(source,{id:'native-graphql-object-fields',mode:'schema'});
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
  if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
  if(path==='/case')return Response.json({source,expected});
  return new Response('<!doctype html><html>GraphQL native object fields</html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage(),external:string[]=[];
  await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const result=await page.evaluate(async()=>{
    const modulePath='/umf.js',u=await import(modulePath),{source,expected}=await(await fetch('/case')).json();
    const archive=u.importGraphqlSchema(source,{id:'native-graphql-object-fields',mode:'schema'});
    if(JSON.stringify(archive)!==JSON.stringify(expected))throw Error('Bun/Chromium GraphQL archive mismatch');
    if(u.exportGraphqlSchema(archive)!==source)throw Error('Native SDL source changed');
    if(archive.modules.some((module:{relationships?:unknown})=>'relationships'in module))throw Error('Native fields invented authored relationship');
    if('Bun'in globalThis||'process'in globalThis)throw Error('Host global in browser');
    return {sourceExact:true,authoredRelationships:0,objectFields:4};
  });
  if(external.length)throw Error('External browser request');
  await Bun.write(`${directory}/browser.json`,JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

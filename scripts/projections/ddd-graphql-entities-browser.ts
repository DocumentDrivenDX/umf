import {chromium} from 'playwright';
import {projectDddEntitiesToGraphql,type Document} from '../../src';

const fixture=await Bun.file('fixtures/projections/ddd-graphql-entities/case.json').json();
const expected=projectDddEntitiesToGraphql(fixture.logical as Document,fixture.policy,'report');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
  if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
  if(path==='/case')return Response.json({fixture,expected});
  return new Response('<!doctype html><html>DDD GraphQL entity projection</html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage(),external:string[]=[];
  await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const result=await page.evaluate(async()=>{
    const modulePath='/umf.js',u=await import(modulePath),{fixture,expected}=await(await fetch('/case')).json();
    const report=u.projectDddEntitiesToGraphql(fixture.logical,fixture.policy,'report');
    if(JSON.stringify(report)!==JSON.stringify(expected))throw Error('Bun/Chromium GraphQL report mismatch');
    const strict=u.projectDddEntitiesToGraphql(fixture.logical,fixture.policy,'strict');
    if(strict.status!=='blocked'||strict.candidate)throw Error('Strict emitted partial SDL');
    if('Bun'in globalThis||'process'in globalThis)throw Error('Host global in browser');
    return {status:report.status,objects:(report.candidate?.match(/\btype (?:Order|Customer|Product|OrderProduct) \{/g)??[]).length,residuals:report.residuals.length,strictBlocked:true};
  });
  if(external.length)throw Error('External browser request');
  await Bun.write('fixtures/projections/ddd-graphql-entities/browser.json',JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

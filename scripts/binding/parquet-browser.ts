import {chromium} from 'playwright';
import {captureParquet,projectBindingToParquet,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/parquet/case.json').json();
const bytes=new Uint8Array(await Bun.file(fixture.native).arrayBuffer());
const archive=captureParquet(bytes,{id:'binding-parquet-native'});
const expected=projectBindingToParquet(fixture.logical as Document,fixture.binding as Document,'report',archive);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
  if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
  if(path==='/case')return Response.json({logical:fixture.logical,binding:fixture.binding,archive,expected});
  return new Response('<!doctype html><html>Binding Parquet</html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage(),external:string[]=[];
  await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const result=await page.evaluate(async()=>{
    const modulePath='/umf.js',u=await import(modulePath),f=await(await fetch('/case')).json();
    const report=u.projectBindingToParquet(f.logical,f.binding,'report',f.archive);
    if(JSON.stringify(report)!==JSON.stringify(f.expected))throw Error('Bun/Chromium report mismatch');
    const strict=u.projectBindingToParquet(f.logical,f.binding,'strict',f.archive);
    if(strict.status!=='blocked'||'candidate'in strict)throw Error('Strict policy emitted a candidate');
    if('Bun'in globalThis||'process'in globalThis)throw Error('Host global in browser');
    return {residuals:report.residuals.length,status:report.status,strictStatus:strict.status};
  });
  if(external.length)throw Error('External browser request');
  await Bun.write('fixtures/binding/parquet/browser.json',JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

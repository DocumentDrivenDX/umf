import {chromium} from 'playwright';
import {captureDeltaLog,projectBindingToDelta,type Document} from '../../src';

const fixture=await Bun.file('fixtures/binding/delta/case.json').json();
const native=captureDeltaLog(await Bun.file(fixture.native).text(),{id:'delta-native'});
const expected=projectBindingToDelta(fixture.logical as Document,fixture.binding as Document,native,'strict');
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=new URL(request.url).pathname;
  if(path==='/umf.js')return new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}});
  if(path==='/case')return Response.json({logical:fixture.logical,binding:fixture.binding,native,expected});
  return new Response('<!doctype html><html>Binding Delta</html>',{headers:{'content-type':'text/html'}});
}});
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage(),external:string[]=[];
  await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){external.push(route.request().url());return route.abort();}return route.continue();});
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const result=await page.evaluate(async()=>{
    const modulePath='/umf.js',u=await import(modulePath),f=await(await fetch('/case')).json();
    const report=u.projectBindingToDelta(f.logical,f.binding,f.native,'strict');
    if(JSON.stringify(report)!==JSON.stringify(f.expected))throw Error('Bun/Chromium report mismatch');
    const lossy=structuredClone(f.binding);
    lossy.extensions['umf.binding'].indexes.push({name:'gin',kind:'gin',on:[{field:{module:'data',element:'order_id'}}],unique:false});
    if(u.projectBindingToDelta(f.logical,lossy,f.native,'strict').status!=='blocked')throw Error('Strict accepted unsupported index');
    if(u.projectBindingToDelta(f.logical,lossy,f.native,'report').status!=='reported')throw Error('Report omitted residual');
    if('Bun'in globalThis||'process'in globalThis)throw Error('Host global in browser');
    return {status:report.status,strictBlocked:true,reportResidualized:true};
  });
  if(external.length)throw Error('External browser request');
  await Bun.write('fixtures/binding/delta/browser.json',JSON.stringify({browser:browser.version(),result,externalRequests:external},null,2)+'\n');
  console.log(JSON.stringify(result));
}finally{await browser?.close();server.stop(true);}

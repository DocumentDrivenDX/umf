import {chromium} from 'playwright';
const built=await Bun.build({entrypoints:['native/arrow/schema-probe.ts'],outdir:'.cache/arrow-browser',naming:'probe.js',target:'browser',format:'esm'});if(!built.success)throw Error(built.logs.join('\n'));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/probe.js')return new Response(Bun.file('.cache/arrow-browser/probe.js'),{headers:{'content-type':'text/javascript'}});
 if(path==='/cases')return new Response(Bun.file('fixtures/arrow/schema-cases.json'),{headers:{'content-type':'application/json'}});
 if(path==='/expected')return new Response(Bun.file('fixtures/arrow/capability-results.json'),{headers:{'content-type':'application/json'}});
 return new Response('<!doctype html><title>Arrow schema probe</title>');
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async()=>{
  const path='/probe.js';const {probe}=await import(path);const cases=await(await fetch('/cases')).json();const expected=await(await fetch('/expected')).json();
  let checked=0;
  for(const c of cases){const match=expected.results.find((r:any)=>r.id===c.id);let actual;try{actual=probe(c.input);}catch(e){if(match.status!=='unsupported')throw e;checked++;continue;}
   if(match.status==='unsupported'||JSON.stringify(actual.before)!==JSON.stringify(match.before)||JSON.stringify(actual.after)!==JSON.stringify(match.after))throw Error('Browser mismatch '+c.id);checked++;
  }
  return {cases:checked,nodeGlobalsAbsent:!('process' in globalThis)&&!('Buffer' in globalThis)};
 });
 if(!result.nodeGlobalsAbsent)throw Error('Unexpected host globals');
 await Bun.write('fixtures/arrow/browser-probe-results.json',JSON.stringify({...result,browser:browser.version(),scope:'Experimental native schema capability probe; no public UMF adapter or data-array claim'},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}

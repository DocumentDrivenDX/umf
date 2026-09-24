import {chromium} from 'playwright';
const base=(process.argv[2]??'fixtures/parquet/arrow-rename').replace(/\/$/,'')+'/',fixture=await Bun.file(base+'results.json').json();
const built=await Bun.build({entrypoints:['src/index.ts','native/arrow/flatbuffer-runtime.ts'],outdir:'.cache/parquet-arrow-rename-browser',naming:'[name].js',target:'browser',format:'esm'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const name=new URL(req.url).pathname.slice(1);return ['index.js','flatbuffer-runtime.js'].includes(name)?new Response(Bun.file('.cache/parquet-arrow-rename-browser/'+name),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Coordinated Parquet rename</title>');}});let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async(fixture)=>{
  const path='/index.js',backendPath='/flatbuffer-runtime.js',u=await import(path),{flatbufferBackend}=await import(backendPath);let recoveries=0,reversed=0,blocked=0;
  const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),b=>b.toString(16).padStart(2,'0')).join('');
  for(const c of fixture.cases){const before=JSON.stringify(c.source),r=u.renameParquetFieldWithArrowSchema(c.source,c.policy,flatbufferBackend);if(JSON.stringify(r)!==JSON.stringify(c.result)||JSON.stringify(c.source)!==before)throw Error('Coordinated result differs');
   if(await hash(u.exportParquetCapture(r.output))!==c.sha256)throw Error('Output differs');
   for(const format of ['json','yaml']){const back=u.readDocument(u.writeDocument(r.output,format),format);if(await hash(u.exportParquetCapture(back))!==c.sha256)throw Error('Recovery differs');recoveries++;}
   const reverse=u.renameParquetFieldWithArrowSchema(r.output,c.inversePolicy??{...c.policy,name:r.rename.from.at(-1)},flatbufferBackend);if(!reverse.output||await hash(u.exportParquetCapture(reverse.output))!==c.restoredSha256)throw Error('Reverse differs');reversed++;
  }
  const c=fixture.cases[0];for(const changes of [{arrowFieldPath:[9]},{arrowFieldPath:[1]},{name:''},{name:'\ud800'}]){const r=u.renameParquetFieldWithArrowSchema(c.source,{...c.policy,...changes},flatbufferBackend);if(r.status!=='blocked'||r.output)throw Error('Invalid partial output');blocked++;}
  return {transformed:fixture.cases.length,recoveries,reversed,blocked,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },fixture);
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write(base+'browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}

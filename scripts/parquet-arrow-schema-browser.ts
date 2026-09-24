import {chromium} from 'playwright';
const base='fixtures/parquet/arrow-schema/',fixtures=await Bun.file(base+'results.json').json(),boundaries=await Bun.file(base+'boundaries.json').json(),encodings=await Bun.file(base+'reencoded.json').json();
const built=await Bun.build({entrypoints:['src/index.ts','native/arrow/flatbuffer-runtime.ts'],outdir:'.cache/parquet-arrow-schema-browser',naming:'[name].js',target:'browser',format:'esm'});if(!built.success)throw Error(String(built.logs));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(req){const name=new URL(req.url).pathname.slice(1);return ['index.js','flatbuffer-runtime.js'].includes(name)?new Response(Bun.file('.cache/parquet-arrow-schema-browser/'+name),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>Parquet embedded Arrow schema</title>');}});let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();let externalRequests=0;await page.route('**/*',r=>{if(!r.request().url().startsWith('http://127.0.0.1:')){externalRequests++;return r.abort();}return r.continue();});await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async({cases,encodings})=>{
  const path='/index.js',backendPath='/flatbuffer-runtime.js',u=await import(path),{flatbufferBackend}=await import(backendPath);let recoveries=0;
  for(const c of cases)for(const format of ['json','yaml']){const restored=u.readDocument(u.writeDocument(c.source,format),format),result=u.getParquetArrowSchema(restored);if(JSON.stringify(result)!==JSON.stringify(c.result))throw Error('Embedded schema observation differs: '+c.id+' '+JSON.stringify(result.diagnostics.slice(-1)));recoveries++;}
  const observed=cases.find((c:any)=>c.id==='stored').result;
  for(const e of encodings.outputs){const restored=u.readDocument(u.writeDocument(observed.message,e.format),e.format),document=e.edited?u.proposeArrowFlatbufferEdit(restored,'/value/header/value/fields/0/name','renamed_events').document:restored;
   const metadata=u.encodeArrowFlatbuffer(document,flatbufferBackend),padded=Math.ceil(metadata.length/8)*8,bytes=new Uint8Array(8+padded),view=new DataView(bytes.buffer);view.setInt32(0,-1,true);view.setInt32(4,padded,true);bytes.set(metadata,8);
   if(Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')!==e.ipcHex)throw Error('Detached schema encoding differs');
  }
  return {cases:cases.length,recoveries,encodedSchemas:encodings.outputs.length,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
 },{cases:[...fixtures.cases,...boundaries.cases],encodings});
 if(externalRequests||!result.nodeGlobalsAbsent)throw Error('Browser boundary');await Bun.write(base+'browser.json',JSON.stringify({...result,externalRequests,browser:browser.version()},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}

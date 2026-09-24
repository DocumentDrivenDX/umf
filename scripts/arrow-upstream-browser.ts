import {chromium} from 'playwright';
for(const [entry,name] of [['src/index.ts','umf.js'],['native/arrow/runtime.ts','runtime.js']]){const built=await Bun.build({entrypoints:[entry!],outdir:'.cache/arrow-upstream-browser',naming:name!,target:'browser',format:'esm'});if(!built.success)throw Error(built.logs.join('\n'));}
const base='fixtures/arrow/upstream/',results=await Bun.file(base+'results.json').json(),schemas=await Bun.file(base+'schema-results.json').json();
const allowed=new Set<string>([...results.results.flatMap((c:any)=>[c.path,'transformed/'+c.path]),...schemas.results.map((c:any)=>c.schema)]);
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){const path=decodeURIComponent(new URL(request.url).pathname).slice(1);if(['umf.js','runtime.js'].includes(path))return new Response(Bun.file('.cache/arrow-upstream-browser/'+path),{headers:{'content-type':'text/javascript'}});if(allowed.has(path))return new Response(Bun.file(base+path));return new Response('<!doctype html><title>UMF upstream Arrow evidence</title>');}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();page.on('console',message=>console.log(message.text()));await page.goto('http://127.0.0.1:'+server.port);
 const report=await page.evaluate(async({cases,schemas})=>{const corePath='/umf.js',runtimePath='/runtime.js';const umf=await import(corePath),{flatbufferBackend}=await import(runtimePath);let checked=0,renamed=0,schemaCount=0;const equal=(a:Uint8Array,b:Uint8Array)=>a.length===b.length&&a.every((v,i)=>v===b[i]);
  for(const c of cases){const bytes=new Uint8Array(await(await fetch('/'+c.path)).arrayBuffer()),doc=umf.captureArrowIpc(bytes,{id:c.path});for(const format of ['json','yaml'])if(!equal(bytes,umf.exportArrowIpcCapture(umf.readDocument(umf.writeDocument(doc,format),format))))throw Error('Capture changed '+c.path);
   const consistency=umf.inspectArrowIpcConsistency(doc);if(consistency.layout.bytesAccountedFor!==c.framed||consistency.footerChecks!==c.footerChecks)throw Error('Inspection differs '+c.path);let changed;
   try{changed=umf.renameArrowIpcField(doc,{fieldPath:[0],name:'umf_renamed_field',uninterpretedMetadata:'preserve-and-report'},flatbufferBackend);}catch(error){if(c.renameStatus!=='blocked'||(error as Error).message!==c.reason)throw error;}
   if(changed){if(c.renameStatus!=='renamed')throw Error('Unexpected transform success '+c.path);const expected=new Uint8Array(await(await fetch('/transformed/'+c.path)).arrayBuffer());if(!equal(umf.exportArrowIpcCapture(changed.document),expected))throw Error('Transform bytes differ '+c.path);renamed++;}
   if(++checked%25===0)console.log('Arrow upstream browser: '+checked);
  }
  for(const c of schemas){const text=await(await fetch('/'+c.schema)).text(),doc=umf.importArrowSchema(text,{id:c.source}),expected=umf.exportArrowSchema(doc);for(const format of ['json','yaml'])if(umf.exportArrowSchema(umf.readDocument(umf.writeDocument(doc,format),format))!==expected)throw Error('Schema changed '+c.source);schemaCount++;}
  return {binaryCases:checked,renamed,schemaCases:schemaCount,nodeGlobalsAbsent:!('process' in globalThis)&&!('Buffer' in globalThis)};
 },{cases:results.results,schemas:schemas.results});
 if(report.binaryCases!==182||report.renamed!==179||report.schemaCases!==91)throw Error('Browser corpus baseline changed');
 if(!report.nodeGlobalsAbsent)throw Error('Unexpected host globals');await Bun.write(base+'browser-results.json',JSON.stringify({...report,browser:browser.version(),commit:results.commit},null,2)+'\n');console.log(report);
}finally{await browser?.close();server.stop(true);}

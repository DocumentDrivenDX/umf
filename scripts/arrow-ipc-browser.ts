import {chromium} from 'playwright';
const built=await Bun.build({entrypoints:['native/arrow/ipc-probe.ts'],outdir:'.cache/arrow-ipc-browser',naming:'probe.js',target:'browser',format:'esm'});if(!built.success)throw Error(built.logs.join('\n'));
const core=await Bun.build({entrypoints:['src/index.ts'],outdir:'.cache/arrow-ipc-browser',naming:'umf.js',target:'browser',format:'esm'});if(!core.success)throw Error(core.logs.join('\n'));
const runtime=await Bun.build({entrypoints:['native/arrow/runtime.ts'],outdir:'.cache/arrow-ipc-browser',naming:'runtime.js',target:'browser',format:'esm'});if(!runtime.success)throw Error(runtime.logs.join('\n'));
const base='fixtures/arrow/ipc-inputs/';const expected=await Bun.file(base+'native-results.json').json();
const metadata=await Bun.file('fixtures/arrow/metadata/manifest.json').json();
const layouts=await Bun.file(base+'layout-oracle-results.json').json();
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 const renamed=layouts.cases.find((c:any)=>path==='/renamed/'+c.file);if(renamed)return new Response(Bun.file(base+renamed.file+'.renamed.arrow'));
 if(path==='/layout-cases')return Response.json(layouts.cases);
 if(path==='/int64.legacy.arrow')return new Response(Bun.file(base+'int64.legacy.arrow'));
 if(path==='/metadata-cases')return Response.json(metadata.cases);
 const meta=metadata.cases.find((c:any)=>path==='/metadata/'+c.file||path==='/metadata/'+c.file+'.umf.json');if(meta)return new Response(Bun.file('fixtures/arrow'+path));
 if(['/umf.js','/runtime.js'].includes(path))return new Response(Bun.file('.cache/arrow-ipc-browser'+path),{headers:{'content-type':'text/javascript'}});
 if(path==='/probe.js')return new Response(Bun.file('.cache/arrow-ipc-browser/probe.js'),{headers:{'content-type':'text/javascript'}});
 const c=expected.find((c:any)=>'/'+c.file===path);if(c)return new Response(Bun.file(base+c.file));
 return new Response('<!doctype html><title>Arrow IPC native evidence</title>');
}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.port);
 const result=await page.evaluate(async(expected:any[])=>{
  const path='/probe.js';const {probeIpc}=await import(path);const corePath='/umf.js',runtimePath='/runtime.js';const umf=await import(corePath);const {observationBackend,flatbufferBackend}=await import(runtimePath);let checked=0,captured=0; 
  for(const c of expected){const bytes=new Uint8Array(await(await fetch('/'+c.file)).arrayBuffer());let actual;
   const doc=umf.captureArrowIpc(bytes,{id:c.file});for(const format of ['json','yaml']){const restored=umf.exportArrowIpcCapture(umf.readDocument(umf.writeDocument(doc,format),format));if(restored.length!==bytes.length||restored.some((b:number,i:number)=>b!==bytes[i]))throw Error('Capture changed bytes '+c.file);}
   const observation=umf.observeArrowIpcCapture(doc,observationBackend);if(observation.complete!==false||observation.status!==(c.status==='rejected'?'uninterpreted':'observed'))throw Error('Observation claim '+c.file);captured++; 
   try{actual=probeIpc(bytes);}catch(e){if(c.status!=='rejected'||(e as Error).message!==c.message)throw e;checked++;continue;}
   if(c.status!=='rewritten'||actual.rows!==c.rows||actual.batches!==c.batches||actual.format!==c.format||JSON.stringify(actual.descriptor)!==JSON.stringify(c.descriptor))throw Error('Browser mismatch '+c.file);checked++;
  }
  const layoutCases=await(await fetch('/layout-cases')).json();let framedIpcInputs=0;
  for(const c of layoutCases){const bytes=new Uint8Array(await(await fetch('/'+c.file)).arrayBuffer());const report=umf.inspectArrowIpcLayout(umf.captureArrowIpc(bytes,{id:c.file}));if(!report.bytesAccountedFor||report.complete!==false||report.format!==c.format||report.consumed!==bytes.length||report.trailingBytes!==0||report.eosOffset!==c.eosOffset||JSON.stringify(report.frames.map(({metadata,...frame}:any)=>frame))!==JSON.stringify(c.frames))throw Error('Browser framing mismatch '+c.file);const consistency=umf.inspectArrowIpcConsistency(report.source);if(consistency.footerChecks!==(c.format==='file'?'matched':'not-applicable')||consistency.complete!==false||consistency.diagnostics.length)throw Error('Browser footer mismatch '+c.file);const renamed=umf.renameArrowIpcField(report.source,{fieldPath:[0],name:'renamed_field_with_a_longer_name',uninterpretedMetadata:'preserve-and-report'},flatbufferBackend);const renamedBytes=umf.exportArrowIpcCapture(renamed.document);const expectedRename=new Uint8Array(await(await fetch('/renamed/'+c.file)).arrayBuffer());if(renamedBytes.length!==expectedRename.length||renamedBytes.some((b:number,i:number)=>b!==expectedRename[i]))throw Error('Browser rename bytes differ '+c.file);framedIpcInputs++;}
  const metadataCases=await(await fetch('/metadata-cases')).json();let decodedMetadataRoots=0;
  for(const c of metadataCases){const bytes=new Uint8Array(await(await fetch('/metadata/'+c.file)).arrayBuffer());const result=umf.decodeArrowFlatbuffer(bytes,{id:c.file,rootType:c.rootType});const expected=await(await fetch('/metadata/'+c.file+'.umf.json')).json();if(result.status!=='decoded'||result.complete!==false||JSON.stringify(JSON.parse(umf.exportArrowFlatbufferModel(result.model)))!==JSON.stringify(expected))throw Error('Browser metadata mismatch '+c.file);const source=umf.exportArrowIpcCapture(result.source);if(source.length!==bytes.length||source.some((b:number,i:number)=>b!==bytes[i]))throw Error('Browser metadata source changed');const encoded=umf.encodeArrowFlatbuffer(result.model,flatbufferBackend);const redecoded=umf.decodeArrowFlatbuffer(encoded,{id:c.file,rootType:c.rootType});if(JSON.stringify(JSON.parse(umf.exportArrowFlatbufferModel(redecoded.model)))!==JSON.stringify(expected))throw Error('Browser metadata encoding mismatch '+c.file);decodedMetadataRoots++;}
  const model={rootType:'Schema',value:{endianness:'Big',features:['COMPRESSED_BODY'],fields:[{name:'x',type:{type:'Int',value:{bitWidth:64,is_signed:true}},dictionary:{id:'9223372036854775807'}}],future:{keep:true}}};
  const modelDoc=umf.importArrowFlatbufferModel(JSON.stringify(model),{id:'logical'});for(const format of ['json','yaml'])if(JSON.stringify(JSON.parse(umf.exportArrowFlatbufferModel(umf.readDocument(umf.writeDocument(modelDoc,format),format))))!==JSON.stringify(model))throw Error('Logical Arrow metadata changed');
  return {datasetRenames:framedIpcInputs,footerConsistencyInputs:framedIpcInputs,framedIpcInputs,encodedMetadataRoots:decodedMetadataRoots,decodedMetadataRoots,logicalFlatbufferModel:true,cases:checked,publicCaptures:captured,nodeGlobalsAbsent:!('process' in globalThis)&&!('Buffer' in globalThis)};
 },expected);
 if(!result.nodeGlobalsAbsent)throw Error('Unexpected host globals');
 await Bun.write(base+'browser-results.json',JSON.stringify({...result,browser:browser.version(),scope:'Public byte capture JSON/YAML round trips and pinned native schema observations; native rewrites tested separately; no complete IPC validation claim'},null,2)+'\n');console.log(result);
}finally{await browser?.close();server.stop(true);}

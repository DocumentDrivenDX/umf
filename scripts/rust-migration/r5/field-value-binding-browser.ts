// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare the staged WASM opt-in binding with all frozen field-value cases.
import {readFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const host = process.env.UMF_R5_FIELD_HOST ?? '/private/tmp/umf-r5-field-value-host';
const wasmPkg = process.env.UMF_R5_FIELD_WASM ?? '/private/tmp/umf-r5-field-value-wasm/pkg';
const root = process.cwd();
await mkdir(join(host, 'wasm/src'), {recursive:true});
await mkdir(join(host, 'node/src'), {recursive:true});
await mkdir(join(host, 'wasm/pkg'), {recursive:true});
for (const [src,dst] of ([
  ['bindings/core/wasm/index.js',join(host,'wasm/index.js')],
  ['bindings/core/wasm/src/core-model.js',join(host,'wasm/src/core-model.js')],
  ['bindings/core/node/src/wire.js',join(host,'node/src/wire.js')],
  ['bindings/core/node/src/javascript-numeric.js',join(host,'node/src/javascript-numeric.js')],
  ['bindings/core/node/src/bit128.js',join(host,'node/src/bit128.js')],
] as const)) await Bun.write(dst, await readFile(join(root,src)));
await Bun.write(join(host,'wasm/package.json'),'{"type":"module"}');
for (const file of ['umf_core_wasm.js','umf_core_wasm_bg.wasm','umf_core_wasm.d.ts']) await Bun.write(join(host,'wasm/pkg',file),await readFile(join(wasmPkg,file)));
const [resources,frozen] = await Promise.all([
  Promise.all(([
    ['coreSchema','spec/core/schema.json'], ['referenceSchema','spec/core/semantic-type-reference.schema.json'],
    ['packageSchema','spec/core/extension-package.schema.json'], ['constraints','spec/metamodel/generated/core-constraints.json'],
    ['domainPolicy','spec/metamodel/generated/domain-policy.json'],
  ] as const).map(async ([key,path])=>[key,await Bun.file(path).json()] as const)).then(entries=>Object.fromEntries(entries)),
  Bun.file('docs/helix/04-build/evidence/rust-migration/r5-field-value/frozen-typescript.json').json(),
]);
const inputJson = JSON.stringify({resources,frozen});
const server=createServer(async(req,res)=>{
  const path=new URL(req.url??'/','http://127.0.0.1').pathname;
  if(path==='/'){res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><meta charset="utf-8"><title>R5 Field-value binding</title>');return;}
  if(path==='/input.json'){res.writeHead(200,{'content-type':'application/json'});res.end(inputJson);return;}
  try{const bytes=await readFile(join(host,path));res.writeHead(200,{'content-type':path.endsWith('.wasm')?'application/wasm':path.endsWith('.js')?'text/javascript':'application/octet-stream'});res.end(bytes);}
  catch{res.writeHead(404);res.end('missing');}
});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const address=server.address();if(!address||typeof address==='string')throw Error('Browser server failed');
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();
  await page.goto('http://127.0.0.1:' + address.port + '/');
  const result=await page.evaluate(async()=>{
    const wrapper=await import(new URL('/wasm/index.js',location.href).href);
    const wasm=await import(new URL('/wasm/pkg/umf_core_wasm.js',location.href).href);
    const {resources,frozen}=await fetch('/input.json').then(r=>r.json());
    const engine=await wrapper.initializeCoreModelWasm(resources,()=>Promise.resolve(wasm),globalThis);
    const canonical=(value:any):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
    const capture=(run:()=>unknown)=>{try{return {result:run()};}catch(error:any){return {thrown:{name:error.name,message:error.message},error};}};
    for(const row of frozen.cases){const captured:any=capture(()=>engine.validateCoreFieldValue(row.source??frozen.source,row.identity,row.value));if(row.thrown&&!(captured.error instanceof TypeError))throw Error(row.id+' did not throw a native JavaScript TypeError');const actual=captured.result===undefined?{thrown:captured.thrown}:{result:captured.result};const expected=row.result?{result:row.result}:{thrown:row.thrown};if(canonical(actual)!==canonical(expected))throw Error(row.id+' differs: '+canonical(actual)+' != '+canonical(expected));}
    let work=0;const metered=wrapper.createCoreModelEngine(wasm,resources,{controls:{meter:(amount:number)=>work+=amount}});metered.validateCoreFieldValue(frozen.cases[0].source??frozen.source,frozen.cases[0].identity,frozen.cases[0].value);if(work===0)throw Error('Host/Rust work was not metered');
    let cancelled=false;const cancellable=wrapper.createCoreModelEngine(wasm,resources,{controls:{isCancelled:()=>cancelled}});cancelled=true;let code='';try{cancellable.validateCoreFieldValue(frozen.cases[0].source??frozen.source,frozen.cases[0].identity,frozen.cases[0].value);}catch(error:any){code=error.code??'';}if(code!=='CANCELLED')throw Error('Cancellation returned '+code);
    if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw Error('Node globals leaked into browser');
    return {cases:frozen.cases.length,typeErrors:frozen.cases.filter((row:any)=>row.thrown).length,meteredWork:work,cancellation:code,nodeGlobalsAbsent:true};
  });
  console.log(JSON.stringify({status:'pass',browser:browser.version(),...result}));
}finally{await browser?.close();server.close();}

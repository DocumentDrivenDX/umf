// SPDX-License-Identifier: MIT OR Apache-2.0
// Build the live V4 browser root and replay Record Values predecessor packets in Chromium.
import assert from 'node:assert/strict';
import {mkdir,readFile,rm} from 'node:fs/promises';
import {extname,join,resolve,sep} from 'node:path';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const root=resolve(import.meta.dirname,'../../..');
const toolchain=process.env.UMF_RUST_TOOLCHAIN??'/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen=process.env.UMF_WASM_BINDGEN??'/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const temp=join('/private/tmp',`umf-r5-record-values-default-${process.pid}-${Date.now()}`),wasmOut=join(temp,'wasm'),browserOut=join(temp,'browser'),cargoTarget=join(temp,'cargo');
const paths={frozen:'docs/helix/04-build/evidence/rust-migration/r5-record-values/frozen-typescript.json',host:'docs/helix/04-build/evidence/rust-migration/r5-record-values/host-admission.json'};
const [packetBytes,hostBytes]=await Promise.all([readFile(join(root,paths.frozen)),readFile(join(root,paths.host))]);
const packet=JSON.parse(packetBytes),host=JSON.parse(hostBytes);
const run=async(command,args,options={})=>{const child=Bun.spawn([command,...args],{cwd:root,env:{...process.env,...options.env},stdout:'pipe',stderr:'pipe'});const [out,err]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);const code=await child.exited;if(code!==0)throw new Error(`${command} failed (${code})\n${out}\n${err}`);return out.trim();};
let browser,server;
try{
 await mkdir(wasmOut,{recursive:true});await mkdir(browserOut,{recursive:true});
 await run(join(toolchain,'cargo'),['build','--locked','--offline','--release','--manifest-path','bindings/core/wasm/Cargo.toml','--target','wasm32-unknown-unknown'],{env:{CARGO_TARGET_DIR:cargoTarget,RUSTC:join(toolchain,'rustc')}});
 assert.equal(await run(bindgen,['--version']),'wasm-bindgen 0.2.100');
 await run(bindgen,['--target','web','--out-dir',wasmOut,'--out-name','umf_core_wasm',join(cargoTarget,'wasm32-unknown-unknown/release/umf_core_wasm.wasm')]);
 const plugin={name:'fresh-record-values-wasm',setup(build){build.onResolve({filter:/umf_core_wasm\.js$/},args=>args.path.endsWith('/pkg/umf_core_wasm.js')?{path:join(wasmOut,'umf_core_wasm.js')}:undefined);}};
 const built=await Bun.build({entrypoints:[join(root,'src/index-browser-v4.ts')],outdir:browserOut,naming:'browser-root.js',target:'browser',format:'esm',plugins:[plugin]});
 if(!built.success)throw new Error(built.logs.map(x=>x.message).join('\n'));
 await Bun.write(join(browserOut,'packets.json'),JSON.stringify({packet,host}));await Bun.write(join(browserOut,'umf_core_wasm_bg.wasm'),Bun.file(join(wasmOut,'umf_core_wasm_bg.wasm')));
 const bundle=join(browserOut,'browser-root.js');
 const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm'};
 server=createServer(async(request,response)=>{const path=decodeURIComponent(new URL(request.url??'/','http://localhost').pathname.slice(1));try{const full=resolve(browserOut,path);if(!full.startsWith(browserOut+sep))throw new Error();response.writeHead(200,{'content-type':mime[extname(full)]??'application/octet-stream'});response.end(await readFile(full));}catch{response.writeHead(404);response.end('not found');}});
 await new Promise((resolveListen,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolveListen);});const address=server.address();if(!address||typeof address==='string')throw new Error('Browser test server failed to bind');
 browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
 const page=await browser.newPage();const errors=[],requests=[];page.on('pageerror',error=>errors.push(String(error)));page.on('request',request=>requests.push(request.url()));
 await page.goto(`http://127.0.0.1:${address.port}/`);
 const observed=await page.evaluate(async()=>{
  const {packet,host}=await(await fetch('/packets.json')).json(),api=await import('/browser-root.js');
  const capture=run=>{try{return{ok:true,value:run()};}catch(error){return{ok:false,error:{name:error?.name??'Error',code:error?.code??'',message:error?.message??String(error),path:error?.path??''}};}};
  const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
  const cases=[];for(const c of packet.cases){const actual=capture(()=>api.validateCoreRecordValues(c.source,c.identity,c.values));if(c.thrown&&!Object.hasOwn(c.thrown,'name'))delete actual.error?.name;const expected=c.thrown?{ok:false,error:c.thrown}:{ok:true,value:c.result};if(canonical(actual)!==canonical(expected))throw new Error(`frozen case ${c.id} differs`);cases.push(c.id);}
  const {source,identity,values}=host.fixture,out=host.outcomes;let s=0,i=0,v=0;
  const sourceAccessor={...source};Object.defineProperty(sourceAccessor,'future',{enumerable:true,get(){s++;return true;}});
  const identityAccessor={get module(){i++;return 'fixture';},element:'item'};
  const valuesAccessor=[{field:{module:'fixture',element:'label'},state:'present',get value(){v++;return{string:'x'};}}];
  const compare=(name,result)=>{if(canonical(result)!==canonical(out.rawCases[name]))throw new Error(`host case ${name} differs`);};
  compare('sourceAccessor',capture(()=>api.validateCoreRecordValues(sourceAccessor,identity,values)));if(s||i||v)throw new Error('accessor getter invoked during source preflight');
  compare('identityAccessor',capture(()=>api.validateCoreRecordValues(source,identityAccessor,valuesAccessor)));if(s||i||v)throw new Error('accessor getter invoked during identity preflight');
  if('process'in globalThis||'Buffer'in globalThis)throw new Error('Node globals exposed in Chromium');
  return{cases:cases.length,hostCases:2,getterCalls:{source:s,identity:i,value:v},nodeGlobalsAbsent:true,userAgent:navigator.userAgent};
 });
 assert.deepEqual(errors,[]);assert(requests.some(url=>url.endsWith('/umf_core_wasm_bg.wasm')));assert.equal(observed.cases,packet.cases.length);assert.equal(observed.hostCases,2);
 process.stdout.write(JSON.stringify({status:'passed',route:'fresh V4 browser source root',browser:browser.version(),...observed})+'\n');
}finally{await browser?.close();if(server)await new Promise(resolveClose=>server.close(resolveClose));await rm(temp,{recursive:true,force:true});}

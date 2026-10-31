// SPDX-License-Identifier: MIT OR Apache-2.0
/** Package the same host-free Rust engine for the single universal browser SDK. */
import {mkdir,copyFile,readdir} from 'node:fs/promises';
const cargo=process.env.CARGO??Bun.which('cargo')??'/opt/homebrew/opt/rustup/bin/cargo';
const bindgen=process.env.WASM_BINDGEN??'wasm-bindgen';
async function run(args:string[]){const child=Bun.spawn(args,{stdout:'inherit',stderr:'inherit'});if(await child.exited)throw Error('Saga runtime build failed: '+args[0]);}
await run([cargo,'build','--locked','--release','--target','wasm32-unknown-unknown','-p','umf-core-wasm']);
const version=await new Promise<string>((resolve,reject)=>{
 const child=Bun.spawn([bindgen,'--version'],{stdout:'pipe',stderr:'pipe'});
 Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]).then(async([stdout,stderr])=>{
  if(await child.exited!==0)reject(new Error(stderr));else resolve(stdout.trim());
 });
});
if(version!=='wasm-bindgen 0.2.100')throw Error(`Expected wasm-bindgen 0.2.100, got ${version}`);
await mkdir('dist/runtime/wasm/pkg',{recursive:true});
await mkdir('dist/runtime/wasm/src',{recursive:true});
await mkdir('dist/runtime/node/src',{recursive:true});
await run([bindgen,'--target','web','--out-dir','dist/runtime/wasm/pkg','--out-name','umf_core_wasm','target/wasm32-unknown-unknown/release/umf_core_wasm.wasm']);
for(const name of ['index.js','index.d.ts'])await copyFile('bindings/core/wasm/'+name,'dist/runtime/wasm/'+name);
for(const name of ['wire.js','wire.d.ts'])await copyFile('bindings/core/node/src/'+name,'dist/runtime/node/src/'+name);
for(const name of await readdir('bindings/core/wasm/src'))
 if(name.endsWith('.js')||name.endsWith('.d.ts'))
  await copyFile('bindings/core/wasm/src/'+name,'dist/runtime/wasm/src/'+name);
await copyFile('bindings/core/wasm/src/shared-sources.json','dist/runtime/wasm/src/shared-sources.json');
console.log('Shared Rust/WASM saga runtime packaged in the coupled SDK.');

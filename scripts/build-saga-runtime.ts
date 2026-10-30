// SPDX-License-Identifier: MIT OR Apache-2.0
/** Package the same host-free Rust engine for the single universal browser SDK. */
import {mkdir,copyFile} from 'node:fs/promises';
const cargo=process.env.CARGO??Bun.which('cargo')??'/opt/homebrew/opt/rustup/bin/cargo';
const bindgen=process.env.WASM_BINDGEN??'wasm-bindgen';
async function run(args:string[]){const child=Bun.spawn(args,{stdout:'inherit',stderr:'inherit'});if(await child.exited)throw Error('Saga runtime build failed: '+args[0]);}
await run([cargo,'build','--locked','--release','--target','wasm32-unknown-unknown','-p','umf-core-wasm']);
await mkdir('dist/runtime/wasm/pkg',{recursive:true});
await mkdir('dist/runtime/node/src',{recursive:true});
await run([bindgen,'--target','web','--out-dir','dist/runtime/wasm/pkg','--out-name','umf_core_wasm','target/wasm32-unknown-unknown/release/umf_core_wasm.wasm']);
for(const name of ['index.js','index.d.ts'])await copyFile('bindings/core/wasm/'+name,'dist/runtime/wasm/'+name);
for(const name of ['wire.js','wire.d.ts'])await copyFile('bindings/core/node/src/'+name,'dist/runtime/node/src/'+name);
console.log('Shared Rust/WASM saga runtime packaged in the coupled SDK.');

// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';

const target='wasm32-unknown-unknown';
const targetDirectory=resolve(process.env.CARGO_TARGET_DIR??'target');
const output='bindings/core/wasm/pkg';
const bindgen=Bun.spawnSync(['wasm-bindgen','--version']);
if(bindgen.exitCode!==0||bindgen.stdout.toString().trim()!=='wasm-bindgen 0.2.100'){
 throw Error('Reference WASM build requires wasm-bindgen 0.2.100');
}
async function run(args:string[]){
 const child=Bun.spawn(args,{stdout:'inherit',stderr:'inherit'});
 if(await child.exited)throw Error('Reference WASM build failed: '+args.join(' '));
}
await run(['cargo','build','--locked','--release','-p','umf-core-wasm','--target',target,'--target-dir',targetDirectory]);
await mkdir(output,{recursive:true});
await run(['wasm-bindgen','--target','web','--out-dir',output,'--out-name','umf_core_wasm',
 resolve(targetDirectory,target,'release/umf_core_wasm.wasm')]);

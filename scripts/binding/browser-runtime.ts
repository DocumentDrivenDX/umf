// SPDX-License-Identifier: MIT OR Apache-2.0
import {resolve} from 'node:path';
import {Buffer} from 'node:buffer';

/** Build the current Browser V4 root with the checked-in WASM glue and binary. */
export async function buildBindingBrowserRuntime() {
  const wasmGlue=resolve('bindings/core/wasm/pkg/umf_core_wasm.js');
  const wasmBytes=resolve('bindings/core/wasm/pkg/umf_core_wasm_bg.wasm');
  const result=await Bun.build({entrypoints:['src/index-browser-v4.ts'],target:'browser',format:'esm',plugins:[{
    name:'binding-v4-wasm',setup(build){build.onResolve({filter:/umf_core_wasm\.js$/},args=>{
      if(args.importer.endsWith('src/index-browser-v4.ts')&&args.path==='../bindings/core/wasm/pkg/umf_core_wasm.js')return {path:wasmGlue};
      if(args.importer.endsWith('bindings/core/wasm/loader.js')&&args.path==='./pkg/umf_core_wasm.js')return {path:wasmGlue};
      return undefined;
    });},
  }]});
  if(!result.success)throw Error(result.logs.join('\n'));
  return {browserJs:await result.outputs[0]!.text(),wasmBytes};
}

/** Existing standalone browser probes serve the JS bundle as their only runtime asset. */
export async function buildStandaloneBindingBrowserRuntime(options:Bun.BuildConfig) {
  const wasmGlue=resolve('bindings/core/wasm/pkg/umf_core_wasm.js');
  const wasmBytes=resolve('bindings/core/wasm/pkg/umf_core_wasm_bg.wasm');
  const defaultWasmUrl="new URL('umf_core_wasm_bg.wasm', import.meta.url)";
  const plugin:Bun.BunPlugin={name:'standalone-umf-wasm',setup(build){
    build.onLoad({filter:/\/umf_core_wasm\.js$/},async args=>{
      if(args.path!==wasmGlue)return undefined;
      const glue=await Bun.file(wasmGlue).text();
      if(!glue.includes(defaultWasmUrl))throw Error('Generated WASM loader no longer declares the expected default asset');
      const base64=Buffer.from(await Bun.file(wasmBytes).arrayBuffer()).toString('base64');
      const wasmInput=`Uint8Array.from(atob(${JSON.stringify(base64)}), character => character.charCodeAt(0))`;
      return {contents:glue.replace(defaultWasmUrl,wasmInput),loader:'js'};
    });
  }};
  return Bun.build({...options,plugins:[...(options.plugins??[]),plugin]});
}

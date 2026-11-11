// SPDX-License-Identifier: MIT OR Apache-2.0
import {resolve} from 'node:path';

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

// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {BunPlugin} from 'bun';

const operations='readJsonValue,inspectDomainPackLoader,generateDomainPackLoaderSchema,generateLoaderInventorySchema';
export const loaderContractRuntimeAssets={
 browser:`export {${operations}} from './umf-browser.js';\nawait import('./umf-browser.js');\nconst {createValidator}=await import('./loader-contract-validator.js');\nexport {createValidator};\n`,
 node:`export {createValidator} from './loader-contract-validator.node.js';\nexport {${operations}} from './umf-node.js';\n`,
} as const;

/** Both browser entries import the same generated module and WASM instance. */
export function sharedSdkBrowserWasm(onResolve?:(source:'wasm-index'|'browser-root')=>void):BunPlugin{
 return {name:'shared-sdk-browser-wasm',setup(build){build.onResolve({filter:/umf_core_wasm\.js$/},args=>{
  const loader=args.importer.endsWith('bindings/core/wasm/loader.js')&&args.path==='./pkg/umf_core_wasm.js';
  const root=args.importer.endsWith('src/index-browser-v4.ts')&&args.path==='../bindings/core/wasm/pkg/umf_core_wasm.js';
  if(loader||root){onResolve?.(loader?'wasm-index':'browser-root');return {path:'./umf_core_wasm.js',external:true};}
  return undefined;
 })}};
}

/** Emit the host bindings and the small conditional loader facades. */
export async function writeLoaderContractRuntimeAssets(dist:string,sourceRoot=process.cwd()):Promise<void>{
 await mkdir(dist,{recursive:true});
 const [browser,node]=await Promise.all([
  Bun.build({entrypoints:[join(sourceRoot,'src/domain-packs/loader-contract-validator-browser.ts')],outdir:dist,naming:'loader-contract-validator.js',target:'browser',format:'esm',treeShaking:true,plugins:[sharedSdkBrowserWasm()]}),
  Bun.build({entrypoints:[join(sourceRoot,'src/domain-packs/loader-contract-validator-node.ts')],outdir:dist,naming:'loader-contract-validator.node.js',target:'node',format:'esm',treeShaking:true,external:['*.node']}),
 ]);
 for(const result of [browser,node])if(!result.success)throw new Error(result.logs.map(log=>log.message).join('\n'));
 await Promise.all([
  writeFile(join(dist,'loader-contract.js'),loaderContractRuntimeAssets.browser),
  writeFile(join(dist,'loader-contract.node.js'),loaderContractRuntimeAssets.node),
 ]);
}

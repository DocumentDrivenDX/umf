// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const operations='readJsonValue,inspectDomainPackLoader,generateDomainPackLoaderSchema,generateLoaderInventorySchema';
export const loaderContractRuntimeAssets={
 browser:`export {createValidator} from './loader-contract-validator.js';\nexport {${operations}} from './umf-browser.js';\n`,
 node:`export {createValidator} from './loader-contract-validator.js';\nexport {${operations}} from './umf-node.js';\n`,
} as const;

/** Bundle only generic AJV interop, then emit the small conditional facades. */
export async function writeLoaderContractRuntimeAssets(dist:string,sourceRoot=process.cwd()):Promise<void>{
 await mkdir(dist,{recursive:true});
 const validator=await Bun.build({entrypoints:[join(sourceRoot,'src/domain-packs/loader-contract-validator.ts')],outdir:dist,naming:'loader-contract-validator.js',target:'browser',format:'esm',treeShaking:true});
 if(!validator.success)throw new Error(validator.logs.map(log=>log.message).join('\n'));
 await Promise.all([
  writeFile(join(dist,'loader-contract.js'),loaderContractRuntimeAssets.browser),
  writeFile(join(dist,'loader-contract.node.js'),loaderContractRuntimeAssets.node),
 ]);
}

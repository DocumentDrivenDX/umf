// SPDX-License-Identifier: MIT OR Apache-2.0
/** Copy only the public renderer's declared runtime assets. Native implementation
 * and version selection remain owned by the released umf.visual package. */
import {copyFile,mkdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
export const visualRuntimeFiles=['lini_wasm.js','lini_wasm_bg.wasm','runtime-manifest.json','LICENSE','licenses/manifest.json','licenses/google-sans.txt','licenses/google-sans-code.txt','licenses/phosphor.txt'] as const;
export function visualRuntimeAsset(name:typeof visualRuntimeFiles[number]){
 return fileURLToPath(import.meta.resolve('@documentdrivendx/umf-visual/renderers/lini/assets/'+name));
}
export async function copyVisualRuntime(destination:string){
 await mkdir(destination,{recursive:true});
 for(const name of visualRuntimeFiles){const target=join(destination,name);await mkdir(dirname(target),{recursive:true});await copyFile(visualRuntimeAsset(name),target);}
}
export async function visualPackageIdentity(){
 const entry=fileURLToPath(import.meta.resolve('@documentdrivendx/umf-visual/renderers/lini'));
 let directory=dirname(entry);
 while(directory!==dirname(directory)){
  const file=Bun.file(join(directory,'package.json'));
  if(await file.exists()){
   const metadata=await file.json();
   if(metadata.name!=='@documentdrivendx/umf-visual')throw Error('Unexpected visual renderer package identity');
   return {name:metadata.name as string,version:metadata.version as string,entrySha256:new Bun.CryptoHasher('sha256').update(await Bun.file(entry).bytes()).digest('hex')};
  }
  directory=dirname(directory);
 }
 throw Error('Missing public visual package metadata');
}

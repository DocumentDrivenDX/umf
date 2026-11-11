// SPDX-License-Identifier: MIT OR Apache-2.0
import {resolve,join} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {root,config,text,source} from './io';

export async function runtimeBuild(output:string){
 await mkdir(output,{recursive:true});
 const build=await Bun.build({
  entrypoints:[resolve(root,config,'runtime/worker.ts')],
  target:'browser',
  format:'esm',
  minify:true,
  metafile:true,
 });
 if(!build.success)throw Error(build.logs.join('\n'));

 const meta=typeof build.metafile==='string'?JSON.parse(build.metafile):build.metafile;
 const paths=Object.keys(meta?.inputs??{});
 const legacy=paths.filter(path=>
  /(^|[\/])ajv(?:@[^/]+)?[\/]/.test(path)||
  /src\/validation\/(schema|document|constraint-kernel)\.ts$/.test(path),
 );
 if(legacy.length)throw Error('REFERENCE_RUNTIME legacy validation in WASM worker: '+legacy.join(', '));

 await Bun.write(join(output,'worker.js'),await text('dist/protobuf/wasm_exec.js')+'\n'+await build.outputs[0]!.text());
 const coreWasm='bindings/core/wasm/pkg/umf_core_wasm_bg.wasm';
 await source(coreWasm,false);
 await Bun.write(join(output,'workbench-core.wasm'),Bun.file(resolve(root,coreWasm)));
 for(const file of ['compiler.wasm','wasm_exec.js','NOTICE.txt']){
  const path='dist/protobuf/'+file;
  await source(path,false);
  await Bun.write(join(output,file==='wasm_exec.js'?'go.js':file),Bun.file(resolve(root,path)));
 }
 for await(const path of new Bun.Glob('dist/protobuf/licenses/*').scan({cwd:root,onlyFiles:true})){
  await source(path,false);
  await Bun.write(join(output,'licenses',path.split('/').at(-1)!),Bun.file(resolve(root,path)));
 }
 for(const path of paths){
  const absolute=resolve(root,path);
  if(absolute.startsWith(root+'/'))await source(absolute.slice(root.length+1),false);
 }
 return paths;
}

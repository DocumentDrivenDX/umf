// SPDX-License-Identifier: MIT OR Apache-2.0
// The preceding CI workspace suite supplies production default-adapter
// regressions. Cold-build the compiler-only CLI from a source snapshot missing
// generated outputs and adapter resources, then exercise its retained paths.
import assert from 'node:assert/strict';
import {copyFile, lstat, mkdir, mkdtemp, readdir, rm} from 'node:fs/promises';
import {dirname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';

const root=resolve(import.meta.dir,'../..');
const cargo=process.env.UMF_R7_CARGO??Bun.which('cargo');
assert(cargo,'Set UMF_R7_CARGO or put cargo on PATH');
const cargoBin=dirname(cargo);
const skipped=new Set(['.git','target','node_modules','.venv','__pycache__']);

async function copyTree(source:string,destination:string):Promise<void>{
 const info=await lstat(source);
 if(info.isSymbolicLink())return;
 if(info.isDirectory()){
  await mkdir(destination,{recursive:true});
  for(const entry of await readdir(source,{withFileTypes:true}))if(!skipped.has(entry.name))await copyTree(join(source,entry.name),join(destination,entry.name));
 }else if(info.isFile()){
  await mkdir(dirname(destination),{recursive:true});
  await copyFile(source,destination);
 }
}

function run(command:string[],cwd:string,targetDir?:string):string{
 const result=Bun.spawnSync(command,{cwd,env:{...process.env,PATH:`${cargoBin}:${process.env.PATH??''}`,...(targetDir?{CARGO_TARGET_DIR:targetDir}:{})},stdout:'pipe',stderr:'pipe'});
 const stdout=new TextDecoder().decode(result.stdout),stderr=new TextDecoder().decode(result.stderr);
 if(result.exitCode!==0)throw Error(`${command.join(' ')} failed (${result.exitCode})\n${stdout}\n${stderr}`);
 return stdout;
}

const temporary=await mkdtemp(join(tmpdir(),'umf-r7-feature-isolation-'));
const snapshot=join(temporary,'snapshot'),target=join(temporary,'target');
try{
 await mkdir(snapshot);
 for(const item of ['Cargo.toml','Cargo.lock','rust-toolchain.toml','.cargo','crates','bindings','spec'])await copyTree(join(root,item),join(snapshot,item));

 const removed=[
  'spec/core/schema.json',
  'spec/core/semantic-type-reference.schema.json',
  'spec/core/extension-package.schema.json',
  'spec/extensions/avro/package.json',
  'spec/extensions/iceberg/package.json',
  'spec/extensions/iceberg/datatype-schema.json',
  'spec/extensions/json-schema/package.json',
  ...(await readdir(join(snapshot,'spec/metamodel/generated'))).map(name=>`spec/metamodel/generated/${name}`),
 ];
 for(const path of removed)await rm(join(snapshot,path),{force:true});

 run([cargo,'build','--locked','--offline','-p','umf-cli','--no-default-features'],snapshot,target);
 const executable=join(target,'debug','umf');
 const metamodel=JSON.parse(run([executable,'metamodel','outputs','--input','spec/metamodel/umf.yaml','--compiler-sha256','0'.repeat(64)],snapshot,target));
 assert.equal(metamodel.profile,'umf.metamodel.compile/1');
 assert(metamodel.outputs.length>0,'metamodel compiler returned no outputs');
 run([cargo,'test','--locked','--offline','-p','umf-cli','--no-default-features','--test','avro_inspect_cli'],snapshot,target);
 console.log('R7 compiler-only isolation and retained Avro path passed');
}finally{
 await rm(temporary,{recursive:true,force:true});
}

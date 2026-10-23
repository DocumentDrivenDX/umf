// SPDX-License-Identifier: MIT OR Apache-2.0
// Build-host bridge. UMF metamodel interpretation belongs to Rust.
import {resolve,dirname} from 'node:path';
import {existsSync,readFileSync,readdirSync,mkdirSync,writeFileSync,rmSync,mkdtempSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {encodeWire,fromWire} from '../../bindings/core/node/src/wire.js';
export const repositoryRoot=resolve(import.meta.dir,'../..');
const hash=(bytes:string|Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
type Artifact={fingerprint:string;executable:string;binarySha256:string;sources:Record<string,string>};
let cached:Artifact|undefined;
function snapshot():{fingerprint:string;sources:Record<string,string>} {
 const paths=['Cargo.toml','Cargo.lock','rust-toolchain.toml','.cargo/config.toml','spec/extensions/tables/operation.schema.json'];
 function visit(path:string):void {for(const entry of readdirSync(resolve(repositoryRoot,path),{withFileTypes:true})){if(['target','node_modules','.git','__pycache__'].includes(entry.name))continue;const child=path+'/'+entry.name;if(entry.isDirectory())visit(child);else if(entry.isFile())paths.push(child);}}
 for(const path of ['crates/umf-core','crates/umf-core-wire','crates/umf-codegen','crates/umf-metamodel','crates/umf-cli'])visit(path);
 const sources=Object.fromEntries(paths.sort().map(path=>[path,hash(readFileSync(resolve(repositoryRoot,path)))]));
 const env=Object.fromEntries(['RUSTFLAGS','CARGO_ENCODED_RUSTFLAGS','CARGO_BUILD_TARGET','RUSTUP_TOOLCHAIN'].map(name=>[name,process.env[name]??'']));
 return {sources,fingerprint:hash(JSON.stringify({sources,env}))};
}
function lock(path:string):()=>void {
 const started=Date.now();
 for(;;){
  try{mkdirSync(path);writeFileSync(resolve(path,'owner.json'),JSON.stringify({pid:process.pid}));return()=>rmSync(path,{recursive:true});}
  catch(error:any){if(error.code!=='EEXIST')throw error;}
  try{const {pid}=JSON.parse(readFileSync(resolve(path,'owner.json'),'utf8'));if(Number.isInteger(pid)&&pid>0){try{process.kill(pid,0);}catch(error:any){if(error.code==='ESRCH'){rmSync(path,{recursive:true});continue;}}}}catch{}
  if(Date.now()-started>120_000)throw Error('METAMODEL_BUILD_LOCK_TIMEOUT');
  Bun.sleepSync(25);
 }
}
function sourceArtifact():Artifact {
 const before=snapshot();
 if(cached?.fingerprint===before.fingerprint){if(hash(readFileSync(cached.executable))!==cached.binarySha256)throw Error('METAMODEL_CACHED_BINARY_CHANGED');return cached;}
 const cargo=Bun.which('cargo')??(existsSync('/opt/homebrew/opt/rustup/bin/cargo')?'/opt/homebrew/opt/rustup/bin/cargo':'cargo');
 // Ordinary cargo builds cannot overwrite this target; bridge processes coordinate
 // through a lock and execute only immutable private copies after releasing it.
 const cacheRoot=resolve(repositoryRoot,'target/metamodel-compiler');mkdirSync(cacheRoot,{recursive:true});
 const unlock=lock(resolve(cacheRoot,'build.lock'));
 try{
  for(let attempt=0;attempt<3;attempt++){
   const inputs=snapshot();
   const child=Bun.spawnSync([cargo,'build','--quiet','--locked','--offline','-p','umf-cli','--message-format=json'],{cwd:repositoryRoot,env:{...process.env,CARGO_TARGET_DIR:resolve(cacheRoot,'build'),PATH:dirname(cargo)+':'+(process.env.PATH??'')},stdout:'pipe',stderr:'pipe'});
   const records=new TextDecoder().decode(child.stdout).split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return {};}});
   if(child.exitCode!==0)throw Error(new TextDecoder().decode(child.stderr).trim()+'\n'+records.filter(item=>item.reason==='compiler-message').map(item=>item.message.rendered).join('\n'));
   const built=records.find(item=>item.reason==='compiler-artifact'&&item.target?.name==='umf'&&item.executable)?.executable;
   if(typeof built!=='string')throw Error('METAMODEL_MISSING_NATIVE_EXECUTABLE');
   const bytes=readFileSync(built);
   if(inputs.fingerprint!==snapshot().fingerprint)continue;
   const directory=mkdtempSync(resolve(cacheRoot,'executable-')),executable=resolve(directory,'umf');
   writeFileSync(executable,bytes,{mode:0o555,flag:'wx'});
   cached={...inputs,executable,binarySha256:hash(bytes)};return cached;
  }
  throw Error('METAMODEL_SOURCE_CHANGED_DURING_BUILD');
 }finally{unlock();}
}
export function nativeMetamodelExecutable():string{return sourceArtifact().executable;}
export function rustMetamodel(args:string[],input?:string,options:{sourceBound?:boolean}={}):any {
 const override=!options.sourceBound&&process.env.UMF_METAMODEL_CLI;
 const artifact=override?undefined:sourceArtifact(),executable=override||artifact!.executable;
 const child=Bun.spawnSync([executable,'metamodel',...args],{cwd:repositoryRoot,stdin:input===undefined?undefined:Buffer.from(input),stdout:'pipe',stderr:'pipe'});
 if(child.exitCode!==0)throw Error(new TextDecoder().decode(child.stderr).trim()||`Rust metamodel compiler exited ${child.exitCode}`);
 let result;try{result=JSON.parse(new TextDecoder().decode(child.stdout));}catch{throw Error('METAMODEL_INVALID_RUST_RESPONSE');}
 if(options.sourceBound)Object.defineProperty(result,'sourceAttestation',{value:{sources:artifact!.sources,binarySha256:artifact!.binarySha256},enumerable:false});
 return result;
}
export function rustMetamodelValue(operation:string,value:unknown):any {return fromWire(rustMetamodel([operation,'--stdin-wire'],encodeWire(value,{maxValues:1_000_000,maxDepth:256})));}

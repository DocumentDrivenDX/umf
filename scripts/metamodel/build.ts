// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {rustMetamodel} from './rust';
import {structuralSource} from './structural';
const root=resolve(import.meta.dir,'../..'),json=(v:any)=>JSON.stringify(v,null,2)+'\n',hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
// The explicit Ajv backend remains a build-time dependency until the JS cutover.
// It never executes inside the native core, CLI, Python wheel or WASM engine.
async function compilerClosure():Promise<string[]>{
 const files=['Cargo.toml','Cargo.lock','rust-toolchain.toml'];
 for(const dir of ['crates/umf-core','crates/umf-core-wire','crates/umf-metamodel','crates/umf-cli']){
  async function visit(path:string):Promise<void>{for(const entry of await readdir(resolve(root,path),{withFileTypes:true})){if(['target','node_modules','.git','__pycache__'].includes(entry.name))continue;const child=path+'/'+entry.name;if(entry.isDirectory())await visit(child);else if(entry.isFile())files.push(child);}}
  await visit(dir);
 }
 return files.sort();
}
async function workspaceClosure():Promise<string[]>{
 const files=['.cargo/config.toml'];
 // Generated native modules and wasm-bindgen pkg files belong to artifact
 // receipts; including them here makes source provenance machine-dependent.
 async function visit(path:string):Promise<void>{
  for(const entry of await readdir(resolve(root,path),{withFileTypes:true})){
   if(['target','node_modules','.git','__pycache__','.venv'].includes(entry.name))continue;
   const child=path+'/'+entry.name;
   if(child.startsWith('bindings/') && (/(?:^|\/)wasm\/pkg(?:\/|$)/.test(child)||/\.(?:node|so|dylib|dll|pyd|wasm|pyc)$/i.test(child)))continue;
   if(entry.isDirectory())await visit(child);else if(entry.isFile())files.push(child);
  }
 }
 for(const path of ['crates','bindings'])await visit(path);
 return files.sort();
}
export async function generate(options:{check?:boolean;outputRoot?:string}={}){
 const compilerFiles=await compilerClosure(),workspaceFiles=(await workspaceClosure()).filter(path=>!compilerFiles.includes(path));
 const backendFiles=['scripts/metamodel/build.ts','scripts/metamodel/rust.ts','scripts/metamodel/structural.ts','src/validation/json-equality.ts','bindings/core/node/src/wire.js','package.json','bun.lock'];
 const sources=Object.fromEntries(await Promise.all(['spec/metamodel/umf.yaml',...compilerFiles,...workspaceFiles,...backendFiles].map(async p=>[p,hash(await readFile(resolve(root,p)))])));
 const provenance={modelSha256:sources['spec/metamodel/umf.yaml'],compilerSha256:hash(json(Object.fromEntries(compilerFiles.map(p=>[p,sources[p]]))))};
 const compiled=rustMetamodel(['outputs','--input','spec/metamodel/umf.yaml','--compiler-sha256',provenance.compilerSha256],undefined,{sourceBound:true});
 for(const [path,value] of Object.entries(compiled.sourceAttestation?.sources??{}))if(sources[path]!==value)throw Error('METAMODEL_COMPILED_SOURCE_COHORT_CHANGED '+path);
 if(!compiled.sourceAttestation?.binarySha256)throw Error('METAMODEL_MISSING_SOURCE_ATTESTATION');
 if(compiled.profile!=='umf.metamodel.compile/1'||compiled.modelSha256!==provenance.modelSha256||compiled.compilerSha256!==provenance.compilerSha256||!Array.isArray(compiled.outputs))throw Error('METAMODEL_RUST_PROVENANCE');
 const outputs:Record<string,string>={};
 const portablePaths=new Set(['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','spec/metamodel/package.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json','spec/metamodel/generated/python-shapes.json','python/umf_access/src/umf_access/generated_core.py','src/generated/core-model.ts']);
 for(const item of compiled.outputs){if(!portablePaths.delete(item.path)||typeof item.contents!=='string')throw Error('METAMODEL_INVALID_RUST_OUTPUT '+item.path);outputs[item.path]=item.contents;}
 if(portablePaths.size)throw Error('METAMODEL_MISSING_RUST_OUTPUT '+[...portablePaths].join(','));
 const core=JSON.parse(outputs['spec/core/schema.json']!),reference=JSON.parse(outputs['spec/core/semantic-type-reference.schema.json']!),pkg=JSON.parse(outputs['spec/core/extension-package.schema.json']!);
 outputs['src/generated/core-validators.ts']=structuralSource([core,reference,pkg]);
 const result={...compiled.result,core,reference,pkg,language:compiled.language,constraints:JSON.parse(outputs['spec/metamodel/generated/core-constraints.json']!),domains:JSON.parse(outputs['spec/metamodel/generated/domain-policy.json']!)};
 const manifest={profile:'umf.metamodel.outputs/1',provenance,sources,workspaceInputs:Object.fromEntries(workspaceFiles.map(p=>[p,sources[p]])),backend:{name:'Ajv standalone',ownership:'explicit third-party build-time JavaScript backend; Rust owns portable metamodel outputs',inputs:Object.fromEntries(backendFiles.map(p=>[p,sources[p]]))},outputs:Object.fromEntries(Object.entries(outputs).map(([p,v])=>[p,{sha256:hash(v),bytes:Buffer.byteLength(v)}]))};outputs['spec/metamodel/generated/manifest.json']=json(manifest);
 // Check the whole declared source set after compilation/backend emission and
 // before touching outputs, including added/removed workspace files.
 const finalPaths=['spec/metamodel/umf.yaml',...await compilerClosure(),...(await workspaceClosure()).filter(path=>!compilerFiles.includes(path)),...backendFiles];
 const finalSources=Object.fromEntries(await Promise.all(finalPaths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 if(JSON.stringify(Object.entries(sources).sort())!==JSON.stringify(Object.entries(finalSources).sort()))throw Error('METAMODEL_SOURCE_CHANGED_DURING_GENERATION');
 const outRoot=options.outputRoot??root;
 if(options.check){for(const [path,value]of Object.entries(outputs)){let actual;try{actual=await readFile(resolve(outRoot,path),'utf8');}catch{throw Error('METAMODEL_MISSING_OUTPUT '+path);}if(actual!==value)throw Error('METAMODEL_STALE_OUTPUT '+path);}for(const dir of ['spec/metamodel/generated','src/generated'])for(const name of await readdir(resolve(outRoot,dir)))if(!Object.hasOwn(outputs,dir+'/'+name))throw Error('METAMODEL_EXTRA_OUTPUT '+dir+'/'+name);}
 else for(const [path,value]of Object.entries(outputs)){await mkdir(dirname(resolve(outRoot,path)),{recursive:true});await writeFile(resolve(outRoot,path),value);}
 return {outputs,manifest,result};
}
if(import.meta.main){const check=process.argv.includes('--check'),index=process.argv.indexOf('--output-root');await generate({check,...(index>=0?{outputRoot:resolve(process.argv[index+1]!)}:{})});if(index<0){const self=Bun.spawn([process.execPath,'scripts/check-metamodel-self.ts'],{cwd:root,stdout:'inherit',stderr:'inherit'});if(await self.exited)throw Error('METAMODEL_SELF_CHECK');if(!check)await generate({check:true});}console.log(check?'Metamodel outputs current':'Metamodel outputs generated');}

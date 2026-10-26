// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile,writeFile,mkdir,readdir,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {rustMetamodel} from './rust';
import {structuralSource} from './structural';
const root=resolve(import.meta.dir,'../..'),json=(v:any)=>JSON.stringify(v,null,2)+'\n',hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const ACCOUNTED_COMPANION_PATH='src/generated/core-validators-accounted.ts';
const ACCOUNTED_COMPANION_SHA256='314cac8416711899285bc3f1a734765d557f7446f7ab0cf58d3dbd2a7dfdd81e';
const ACCOUNTED_COMPANION_BYTES=1525352;
const STAGE_A_BASE='docs/helix/04-build/evidence/schema-migration-design-review/main-reconciliation-001/stage-a-40273176398';
const ADOPTED_SOURCE_INPUTS='docs/helix/04-build/evidence/schema-migration-design-review/main-reconciliation-001/sdk-057-generation-40391320829-adopted/source-inputs.json';
const ADOPTED_SOURCE_INPUTS_SHA256='70f25355a30c0a66fbd3e8f72a53704e139d6beb4e206433e0d3067c13b9195a';
const ACCOUNTED_INPUTS={
 'src/generated/core-validators.ts':'4a88fd9bc398c56d71e535841322dcf10d2851e16b026c14679e2d79062e90a7',
 'spec/core/schema.json':'bdcf1c6b8a197dfbd769ea47a879eaabeeb1d71cc00cab1f9e600175354c5da7',
 'spec/core/semantic-type-reference.schema.json':'48def42448706bbdfe68c458746d23610767feae0da6456735674524b8018887',
 'spec/core/extension-package.schema.json':'a4f4694b3ae32ef47a898f49fdce969b890f1ac901fc6747a43cb8c9c6c77c35',
} as const;
const OUTPUT_PATHS=[
 'spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json',
 'spec/metamodel/package.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json',
 'spec/metamodel/generated/python-shapes.json','python/umf_access/src/umf_access/generated_core.py',
 'src/generated/core-model.ts','src/generated/core-validators.ts','spec/metamodel/generated/manifest.json',
] as const;
const stageAEvidence=[
 `${STAGE_A_BASE}/manifest.json`,`${STAGE_A_BASE}/owner-result.json`,`${STAGE_A_BASE}/sol-output-source-review.md`,
 `${STAGE_A_BASE}/source-pins.sha256`,`${STAGE_A_BASE}/identity.txt`,`${STAGE_A_BASE}/SHA256SUMS`,ADOPTED_SOURCE_INPUTS,
];
async function regularBytes(path:string):Promise<Uint8Array>{
 const absolute=resolve(root,path),info=await lstat(absolute);
 if(!info.isFile()||info.isSymbolicLink())throw Error('METAMODEL_CUSTODY_NOT_REGULAR '+path);
 return readFile(absolute);
}
async function accountedCompanionCustody(){
 const adoptedBytes=await regularBytes(ADOPTED_SOURCE_INPUTS);
 if(hash(adoptedBytes)!==ADOPTED_SOURCE_INPUTS_SHA256)throw Error('METAMODEL_COMPANION_ADOPTION_RECEIPT');
 const adopted=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(adoptedBytes));
 const custody=adopted.adoptedR2Companion;
 if(!custody||custody.path!==ACCOUNTED_COMPANION_PATH||custody.sha256!==ACCOUNTED_COMPANION_SHA256||custody.bytes!==ACCOUNTED_COMPANION_BYTES
   ||custody.adoptionCommit!=='63762c9ac233debf1cb6021a3db1fcdc763e64aa'||custody.stageARunId!=='40273176398'
   ||custody.stageASourceCommit!=='85f4a645cd14e7673a83fc475d3dd66dcc629edc'||custody.artifactId!==12629535479
   ||custody.artifactSha256!=='a848f70c9c5494b549bbfb7ca6fd69fa926494b8227fa2d7484c3ad38e310e0c')throw Error('METAMODEL_COMPANION_ADOPTION_IDENTITY');
 const stageManifestPath=`${STAGE_A_BASE}/manifest.json`,stageOwnerPath=`${STAGE_A_BASE}/owner-result.json`,stageReviewPath=`${STAGE_A_BASE}/sol-output-source-review.md`,stagePinsPath=`${STAGE_A_BASE}/source-pins.sha256`;
 const [manifestBytes,ownerBytes,reviewBytes,pinsBytes]=await Promise.all([stageManifestPath,stageOwnerPath,stageReviewPath,stagePinsPath].map(regularBytes));
 if(hash(manifestBytes)!==custody.provenanceManifestSha256||hash(ownerBytes)!==custody.ownerResultSha256
   ||hash(reviewBytes)!==custody.sourceOutputReviewSha256||hash(pinsBytes)!==custody.sourcePinsSha256
   ||hash(reviewBytes)!=='cb7a1e4141460b415665f561dbb395b188dcff623d2dfd8ebadf451ad797b757')throw Error('METAMODEL_COMPANION_STAGE_A_CUSTODY');
 const manifest=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(manifestBytes)),owner=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(ownerBytes));
 if(manifest.profile!=='umf.r2-metering-generated-companion/1'||manifest.run?.id!=='40273176398'||manifest.run?.sha!==custody.stageASourceCommit
   ||manifest.output?.path!=='core-validators-accounted.ts'||manifest.output?.sha256!==ACCOUNTED_COMPANION_SHA256||manifest.output?.bytes!==ACCOUNTED_COMPANION_BYTES
   ||manifest.generator?.outputPurpose!=='stage-a'||manifest.execution?.artifactOnly!==true||manifest.execution?.companionEvaluated!==false
   ||owner.status!=='GENERATION_PASS_SOURCE_OUTPUT_ADOPTED'||owner.artifactId!==custody.artifactId||owner.artifactSha256!==custody.artifactSha256
   ||owner.outputSourceReviewSha256!==custody.sourceOutputReviewSha256||owner.adoptionTarget!==ACCOUNTED_COMPANION_PATH)throw Error('METAMODEL_COMPANION_STAGE_A_RECEIPT');
 const inputRows=new Map((Array.isArray(manifest.inputs)?manifest.inputs:[]).map((row:any)=>[row.path,row]));
 const inputBindings:Record<string,{sha256:string;bytes:number}>={};
 for(const [path,expected] of Object.entries(ACCOUNTED_INPUTS)){
  const bytes=await regularBytes(path),row=inputRows.get(path) as any;
  if(hash(bytes)!==expected||!row||row.sha256!==expected||row.bytes!==bytes.byteLength)throw Error('METAMODEL_COMPANION_INPUT_DRIFT '+path);
  inputBindings[path]={sha256:expected,bytes:bytes.byteLength};
 }
 const adoptedRows=new Map((Array.isArray(adopted.pinnedSourceInputs)?adopted.pinnedSourceInputs:[]).map((row:any)=>[row.path,row]));
 for(const [path,expected] of Object.entries(ACCOUNTED_INPUTS)){
  const row=adoptedRows.get(path) as any;
  if(!row||row.sha256!==expected||row.bytes!==(await regularBytes(path)).byteLength)throw Error('METAMODEL_COMPANION_ADOPTED_INPUT_BINDING '+path);
 }
 const companionBytes=await regularBytes(ACCOUNTED_COMPANION_PATH);
 if(companionBytes.byteLength!==ACCOUNTED_COMPANION_BYTES||hash(companionBytes)!==ACCOUNTED_COMPANION_SHA256)throw Error('METAMODEL_COMPANION_BYTES');
 return {path:ACCOUNTED_COMPANION_PATH,sha256:ACCOUNTED_COMPANION_SHA256,bytes:ACCOUNTED_COMPANION_BYTES,
   adoptionCommit:custody.adoptionCommit,stageA:{runId:custody.stageARunId,sourceCommit:custody.stageASourceCommit,
     artifactId:custody.artifactId,artifactSha256:custody.artifactSha256,manifestPath:stageManifestPath,
     manifestSha256:custody.provenanceManifestSha256,ownerResultPath:stageOwnerPath,ownerResultSha256:custody.ownerResultSha256,
     sourceReviewPath:stageReviewPath,sourceReviewSha256:custody.sourceOutputReviewSha256},inputs:inputBindings};
}
// External compile-time inputs in the Rust CLI dependency closure. The other
// schema-looking includes in Rust sources are behind cfg(test) and are not
// part of this CLI build's compile-time resource set.
const rustCompileResources=['spec/extensions/tables/operation.schema.json'];
// The explicit Ajv backend remains a build-time dependency until the JS cutover.
// It never executes inside the native core, CLI, Python wheel or WASM engine.
async function compilerClosure():Promise<string[]>{
 const files=['Cargo.toml','Cargo.lock','rust-toolchain.toml','.cargo/config.toml',...rustCompileResources];
 for(const dir of ['crates/umf-core','crates/umf-core-wire','crates/umf-codegen','crates/umf-metamodel','crates/umf-cli']){
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
 const companion=await accountedCompanionCustody();
 const compilerFiles=await compilerClosure(),workspaceFiles=(await workspaceClosure()).filter(path=>!compilerFiles.includes(path));
 const backendFiles=['scripts/metamodel/build.ts','scripts/metamodel/rust.ts','scripts/metamodel/structural.ts','src/validation/json-equality.ts','bindings/core/node/src/wire.js','package.json','bun.lock',...stageAEvidence];
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
 const manifest={profile:'umf.metamodel.outputs/1',provenance,sources,compilerInputs:Object.fromEntries(compilerFiles.map(p=>[p,sources[p]])),workspaceInputs:Object.fromEntries(workspaceFiles.map(p=>[p,sources[p]])),backend:{name:'Ajv standalone',ownership:'explicit third-party build-time JavaScript backend; Rust owns portable metamodel outputs',inputs:Object.fromEntries(backendFiles.map(p=>[p,sources[p]]))},separatelyOwned:{accountedCompanion:companion},outputs:Object.fromEntries(Object.entries(outputs).map(([p,v])=>[p,{sha256:hash(v),bytes:Buffer.byteLength(v)}]))};outputs['spec/metamodel/generated/manifest.json']=json(manifest);
 // Check the whole declared source set after compilation/backend emission and
 // before touching outputs, including added/removed workspace files.
 const finalPaths=['spec/metamodel/umf.yaml',...await compilerClosure(),...(await workspaceClosure()).filter(path=>!compilerFiles.includes(path)),...backendFiles];
 const finalSources=Object.fromEntries(await Promise.all(finalPaths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 if(JSON.stringify(Object.entries(sources).sort())!==JSON.stringify(Object.entries(finalSources).sort()))throw Error('METAMODEL_SOURCE_CHANGED_DURING_GENERATION');
 const outRoot=options.outputRoot??root;
 if(options.check){for(const [path,value]of Object.entries(outputs)){let actual;try{actual=await readFile(resolve(outRoot,path),'utf8');}catch{throw Error('METAMODEL_MISSING_OUTPUT '+path);}if(actual!==value)throw Error('METAMODEL_STALE_OUTPUT '+path);}
  const stagedCompanion=resolve(outRoot,ACCOUNTED_COMPANION_PATH),stagedInfo=await lstat(stagedCompanion).catch(()=>undefined);
  if(!stagedInfo?.isFile()||stagedInfo.isSymbolicLink()||stagedInfo.size!==ACCOUNTED_COMPANION_BYTES||hash(await readFile(stagedCompanion))!==ACCOUNTED_COMPANION_SHA256)throw Error('METAMODEL_SEPARATELY_OWNED_COMPANION_MISMATCH');
  for(const dir of ['spec/metamodel/generated','src/generated'])for(const name of await readdir(resolve(outRoot,dir))){const path=dir+'/'+name;if(!Object.hasOwn(outputs,path)&&!(dir==='src/generated'&&path===ACCOUNTED_COMPANION_PATH))throw Error('METAMODEL_EXTRA_OUTPUT '+path);}
 }
 else for(const [path,value]of Object.entries(outputs)){await mkdir(dirname(resolve(outRoot,path)),{recursive:true});await writeFile(resolve(outRoot,path),value);}
 return {outputs,manifest,result};
}
if(import.meta.main){const check=process.argv.includes('--check'),index=process.argv.indexOf('--output-root');await generate({check,...(index>=0?{outputRoot:resolve(process.argv[index+1]!)}:{})});if(index<0){const self=Bun.spawn([process.execPath,'scripts/check-metamodel-self.ts'],{cwd:root,stdout:'inherit',stderr:'inherit'});if(await self.exited)throw Error('METAMODEL_SELF_CHECK');if(!check)await generate({check:true});}console.log(check?'Metamodel outputs current':'Metamodel outputs generated');}

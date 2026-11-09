// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {rustMetamodel} from './rust';
import {structuralSource} from './structural';
import {structuralAccountingSource} from './structural-accounting';
import {assertStableSourcePartition,collectSourceRosters,loadSourceBoundary,partitionRustSources} from './source-closure';
const root=resolve(import.meta.dir,'../..'),json=(v:any)=>JSON.stringify(v,null,2)+'\n',hash=(v:string|Uint8Array)=>createHash('sha256').update(v).digest('hex');
const ACCOUNTED_COMPANION_PATH='src/generated/core-validators-accounted.ts';
const OUTPUT_PATHS=[
 'spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json',
 'spec/core/facet-operation-v3.schema.json','spec/core/cardinality-operation-v4.schema.json','spec/core/kind-operation-v6.schema.json',
 'spec/core/nullability-operation-v5.schema.json','spec/core/key-operation-v2.schema.json','spec/core/record-type-operation-v6.schema.json',
 'spec/metamodel/package.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json',
 'spec/metamodel/generated/python-shapes.json','python/umf_access/src/umf_access/generated_core.py',
 'src/generated/core-model.ts','src/generated/core-validators.ts',ACCOUNTED_COMPANION_PATH,'spec/metamodel/generated/manifest.json',
] as const;
export async function generate(options:{check?:boolean;outputRoot?:string}={}){
 const {compilerFiles:compilerRoster,workspaceFiles:workspaceRoster}=await collectSourceRosters(root);
 const rustSourcePaths=[...new Set([...compilerRoster,...workspaceRoster])].filter(path=>path.endsWith('.rs'));
 const boundary=await loadSourceBoundary(root,rustSourcePaths,process.env);
 const partition=partitionRustSources(compilerRoster,workspaceRoster,boundary);
 const compilerFiles=partition.compilerInputs,workspaceFiles=partition.workspaceInputs;
 const backendFiles=['scripts/metamodel/build.ts','scripts/metamodel/rust.ts','scripts/metamodel/source-closure.ts','scripts/metamodel/structural.ts','scripts/metamodel/structural-accounting.ts','src/validation/json-equality.ts','bindings/core/node/src/wire.js','package.json','bun.lock'];
 const sources=Object.fromEntries(await Promise.all(['spec/metamodel/umf.yaml',...compilerFiles,...workspaceFiles,...backendFiles].map(async p=>[p,hash(await readFile(resolve(root,p)))])));
 const provenance={modelSha256:sources['spec/metamodel/umf.yaml'],compilerSha256:hash(json(Object.fromEntries(compilerFiles.map(p=>[p,sources[p]]))))};
 const compiled=rustMetamodel(['outputs','--input','spec/metamodel/umf.yaml','--compiler-sha256',provenance.compilerSha256],undefined,{sourceBound:true});
 for(const [path,value] of Object.entries(compiled.sourceAttestation?.sources??{}))if(sources[path]!==value)throw Error('METAMODEL_COMPILED_SOURCE_COHORT_CHANGED '+path);
 if(!compiled.sourceAttestation?.binarySha256)throw Error('METAMODEL_MISSING_SOURCE_ATTESTATION');
 if(compiled.profile!=='umf.metamodel.compile/1'||compiled.modelSha256!==provenance.modelSha256||compiled.compilerSha256!==provenance.compilerSha256||!Array.isArray(compiled.outputs))throw Error('METAMODEL_RUST_PROVENANCE');
 const outputs:Record<string,string>={};
 const portablePaths=new Set(['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','spec/core/facet-operation-v3.schema.json','spec/core/cardinality-operation-v4.schema.json','spec/core/kind-operation-v6.schema.json','spec/core/nullability-operation-v5.schema.json','spec/core/key-operation-v2.schema.json','spec/core/record-type-operation-v6.schema.json','spec/metamodel/package.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json','spec/metamodel/generated/python-shapes.json','python/umf_access/src/umf_access/generated_core.py','src/generated/core-model.ts']);
 for(const item of compiled.outputs){if(!portablePaths.delete(item.path)||typeof item.contents!=='string')throw Error('METAMODEL_INVALID_RUST_OUTPUT '+item.path);outputs[item.path]=item.contents;}
 if(portablePaths.size)throw Error('METAMODEL_MISSING_RUST_OUTPUT '+[...portablePaths].join(','));
 const core=JSON.parse(outputs['spec/core/schema.json']!),reference=JSON.parse(outputs['spec/core/semantic-type-reference.schema.json']!),pkg=JSON.parse(outputs['spec/core/extension-package.schema.json']!);
 outputs['src/generated/core-validators.ts']=structuralSource([core,reference,pkg]);
 outputs[ACCOUNTED_COMPANION_PATH]=structuralAccountingSource(outputs['src/generated/core-validators.ts']!,[core,reference,pkg]);
 const result={...compiled.result,core,reference,pkg,language:compiled.language,constraints:JSON.parse(outputs['spec/metamodel/generated/core-constraints.json']!),domains:JSON.parse(outputs['spec/metamodel/generated/domain-policy.json']!)};
 const manifest={profile:'umf.metamodel.outputs/1',provenance,sources,compilerInputs:Object.fromEntries(compilerFiles.map(p=>[p,sources[p]])),workspaceInputs:Object.fromEntries(workspaceFiles.map(p=>[p,sources[p]])),backend:{name:'Ajv standalone with bounded structural accounting transform',ownership:'explicit third-party build-time JavaScript backend; Rust owns portable metamodel outputs',inputs:Object.fromEntries(backendFiles.map(p=>[p,sources[p]]))},outputs:Object.fromEntries(Object.entries(outputs).map(([p,v])=>[p,{sha256:hash(v),bytes:Buffer.byteLength(v)}]))};outputs['spec/metamodel/generated/manifest.json']=json(manifest);
 if(OUTPUT_PATHS.length!==Object.keys(outputs).length||OUTPUT_PATHS.some(path=>!Object.hasOwn(outputs,path)))throw Error('METAMODEL_OUTPUT_ROSTER');
 // Check the whole declared source set after compilation/backend emission and
 // before touching outputs, including added/removed workspace files.
 const {compilerFiles:finalCompilerRoster,workspaceFiles:finalWorkspaceRoster}=await collectSourceRosters(root);
 const finalRustSourcePaths=[...new Set([...finalCompilerRoster,...finalWorkspaceRoster])].filter(path=>path.endsWith('.rs'));
 const finalBoundary=await loadSourceBoundary(root,finalRustSourcePaths,process.env);
 const finalPartition=partitionRustSources(finalCompilerRoster,finalWorkspaceRoster,finalBoundary);
 assertStableSourcePartition(partition,finalPartition);
 const finalPaths=['spec/metamodel/umf.yaml',...finalCompilerRoster,...finalWorkspaceRoster.filter(path=>!finalCompilerRoster.includes(path)),...backendFiles];
 const finalSources=Object.fromEntries(await Promise.all(finalPaths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
 if(JSON.stringify(Object.entries(sources).sort())!==JSON.stringify(Object.entries(finalSources).sort()))throw Error('METAMODEL_SOURCE_CHANGED_DURING_GENERATION');
 const outRoot=options.outputRoot??root;
 if(options.check){for(const [path,value]of Object.entries(outputs)){let actual;try{actual=await readFile(resolve(outRoot,path),'utf8');}catch{throw Error('METAMODEL_MISSING_OUTPUT '+path);}if(actual!==value)throw Error('METAMODEL_STALE_OUTPUT '+path);}
  for(const dir of ['spec/metamodel/generated','src/generated'])for(const name of await readdir(resolve(outRoot,dir))){const path=dir+'/'+name;if(!Object.hasOwn(outputs,path))throw Error('METAMODEL_EXTRA_OUTPUT '+path);}
 }
 else for(const [path,value]of Object.entries(outputs)){await mkdir(dirname(resolve(outRoot,path)),{recursive:true});await writeFile(resolve(outRoot,path),value);}
 return {outputs,manifest,result};
}
if(import.meta.main){const check=process.argv.includes('--check'),index=process.argv.indexOf('--output-root');await generate({check,...(index>=0?{outputRoot:resolve(process.argv[index+1]!)}:{})});if(index<0){const self=Bun.spawn([process.execPath,'scripts/check-metamodel-self.ts'],{cwd:root,stdout:'inherit',stderr:'inherit'});if(await self.exited)throw Error('METAMODEL_SELF_CHECK');if(!check)await generate({check:true});}console.log(check?'Metamodel outputs current':'Metamodel outputs generated');}

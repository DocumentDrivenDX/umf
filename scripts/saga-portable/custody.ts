// SPDX-License-Identifier: MIT OR Apache-2.0
/** Verify exact portable-host roster, semantic vectors, shared inputs and tested bytes. */
import {createHash} from 'node:crypto';
import {copyFile,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

export const SAGA_QUALIFICATION_INPUTS=[
 'scripts/saga-portable/verify.ts','scripts/saga-portable/custody.ts','scripts/saga-portable/collect.ts','scripts/saga-portable/native.ts','scripts/saga-portable/browser.ts',
 'scripts/saga-portable/other-hosts.ts','scripts/saga-portable/python-probe.py','scripts/test-sdk-install.ts',
 'scripts/check-core-authority.ts',
 'tools/verify_python_artifacts.py',
 'tests/saga/portable-oracle.test.ts','tests/saga/custody.test.ts','tests/actions/assessment.test.ts','package.json','spec/release.json',
 'python/tests/test_python_artifact_version.py',
 'fixtures/saga/portable.json','src/extensions/actions/saga.ts','src/extensions/actions/saga-resources.ts','src/registry/registry.ts',
 'crates/umf-codegen/src/actions/saga/mod.rs','crates/umf-codegen/src/actions/saga/tests.rs',
 'bindings/core/node/index.js','bindings/core/node/src/wire.js','python/src/umf/saga.py','python/pyproject.toml','python/hatch_build.py','python/umf_codegen/pyproject.toml','python/umf_codegen/hatch_build.py',
 'spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json',
 'spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json',
 'spec/extensions/tables/package.json','spec/extensions/actions/package.json','spec/extensions/actions/schema.json','spec/extensions/binding/package.json',
 'spec/extensions/binding-stable/package.json','spec/extensions/saga/package.json','spec/extensions/saga/schema.json','spec/extensions/saga/runtime.schema.json'
] as const;
export const SDK_SAGA_MEMBERS=[
 'package.json','manifest.json','dist/umf.js','dist/loader-contract.js','dist/runtime/wasm/index.js',
 'dist/runtime/wasm/pkg/umf_core_wasm.js','dist/runtime/wasm/pkg/umf_core_wasm_bg.wasm'
] as const;
export type PortableCase={id:string;covers:number[]};
export type PortableArtifact={path:string;sha256:string};
export type PortableProducerSnapshot={qualificationInputs:Record<string,string>;artifacts:Record<string,string>};
export type PortableInstalledBinding={status:'passed';wheelSha256:string;beforeNativeSha256:string;afterNativeSha256:string;beforeInstalledFileCount:number;afterInstalledFileCount:number;beforePackageFileCount:number;afterPackageFileCount:number};
export type PortableHostReport={profile?:string;hostId?:string;host?:string;cases?:number;passed?:number;results?:{id:string;covers:number[];passed:boolean}[];corpusSha256?:string;qualificationInputs?:Record<string,string>;artifacts?:Record<string,PortableArtifact>;installedBinding?:PortableInstalledBinding;runtime?:unknown};
export type PortableRuntimeExpectation={host:string;fields:readonly string[]};
export type PortableCohortExpectation={root:string;cases:PortableCase[];inputPaths:readonly string[];reports:Record<string,PortableHostReport>;artifacts:Record<string,Record<string,string>>;runtime:Record<string,PortableRuntimeExpectation>;expectedHosts:readonly string[]};
const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const insist:(condition:unknown,message:string)=>asserts condition=(condition,message)=>{if(!condition)throw new Error(message);};

export async function sha256File(path:string):Promise<string>{return sha(await readFile(path));}
export function validatePortableCaseRoster(cases:unknown):asserts cases is PortableCase[]{
 insist(Array.isArray(cases)&&cases.length>0,'portable corpus must contain cases');
 const ids=new Set<string>(),coverage=new Set<number>();
 for(const [index,item] of cases.entries()){
  insist(typeof item==='object'&&item!==null,'portable case must be an object');
  const candidate=item as Partial<PortableCase>;
  insist(typeof candidate.id==='string'&&candidate.id.length>0,`portable case ${index} has no ID`);
  insist(!ids.has(candidate.id),`portable corpus repeats case ID ${candidate.id}`);ids.add(candidate.id);
  insist(Array.isArray(candidate.covers)&&candidate.covers.length>0,`portable case ${candidate.id} has no contract coverage`);
  const local=new Set<number>();
  for(const number of candidate.covers){insist(Number.isInteger(number)&&number>=1&&number<=16,`portable case ${candidate.id} has invalid coverage ${number}`);insist(!local.has(number),`portable case ${candidate.id} repeats coverage ${number}`);local.add(number);coverage.add(number);}
 }
 for(let number=1;number<=16;number++)insist(coverage.has(number),`portable corpus omits required contract coverage ${number}`);
}
export async function hashInputFiles(root:string,paths:readonly string[]):Promise<Record<string,string>>{
 const pairs=await Promise.all(paths.map(async path=>[path,await sha256File(resolve(root,path))] as const));
 return Object.fromEntries(pairs);
}
export async function capturePortableProducerSnapshot(root:string,artifactPaths:Record<string,string>):Promise<PortableProducerSnapshot>{
 const qualificationInputs=await hashInputFiles(root,SAGA_QUALIFICATION_INPUTS);
 const artifacts=Object.fromEntries(await Promise.all(Object.entries(artifactPaths).map(async([name,path])=>[name,await sha256File(resolve(root,path))] as const)));
 return {qualificationInputs,artifacts};
}
export async function verifyPortableProducerSnapshot(root:string,artifactPaths:Record<string,string>,snapshot:PortableProducerSnapshot):Promise<void>{
 insist(same(await hashInputFiles(root,SAGA_QUALIFICATION_INPUTS),snapshot.qualificationInputs),'qualification inputs changed during host verification');
 const artifacts=Object.fromEntries(await Promise.all(Object.entries(artifactPaths).map(async([name,path])=>[name,await sha256File(resolve(root,path))] as const)));
 insist(same(artifacts,snapshot.artifacts),'tested host artifact bytes changed during verification');
}
export async function retainVerifiedFile(stage:string,source:string,name:string,expectedHash:string,retained:Record<string,string>):Promise<void>{
 insist(/^[A-Za-z0-9._-]+$/.test(name),`unsafe retained artifact name: ${name}`);
 insist(!retained[name],`duplicate retained artifact name: ${name}`);
 insist(await sha256File(source)===expectedHash,`validated source bytes changed before retention: ${name}`);
 const target=join(stage,name);await copyFile(source,target);
 insist(await sha256File(target)===expectedHash,`copied bytes differ from verified source: ${name}`);
 insist(await sha256File(source)===expectedHash,`validated source bytes changed while retaining: ${name}`);
 retained[name]=expectedHash;
}
export function verifyPortableResult(result:Pick<PortableHostReport,'profile'|'cases'|'passed'|'results'>,cases:PortableCase[],profile='umf.saga.portable-result/1'):void{
 insist(result.profile===profile,`wrong result profile: ${result.profile}`);
 insist(result.cases===cases.length&&result.passed===cases.length,`not all static cases passed: ${result.passed}/${result.cases}`);
 const expected=cases.map(c=>({id:c.id,covers:c.covers,passed:true}));
 insist(Array.isArray(result.results)&&same(result.results,expected),'portable result IDs/order/coverage differ from the complete independent case roster');
}

export async function verifyPortableCohort(expect:PortableCohortExpectation):Promise<void>{
 const expectedHosts=[...expect.expectedHosts].sort(),reportHosts=Object.keys(expect.reports).sort();
 insist(same(reportHosts,expectedHosts),'portable host roster is missing, extra, or duplicated');
 const paths=[...expect.inputPaths];
 const inputHashes=await hashInputFiles(expect.root,paths),corpusHash=inputHashes['fixtures/saga/portable.json'];
 insist(Boolean(corpusHash),'portable corpus is absent from the hashed input roster');
 for(const hostId of expectedHosts){
  const report=expect.reports[hostId]!;
  insist(report.profile==='umf.saga.portable-host-receipt/2',`${hostId} receipt has an unsupported profile`);
  insist(report.hostId===hostId,`${hostId} receipt identifies a different host`);
  const runtime=expect.runtime[hostId];
  insist(Boolean(runtime),`no runtime identity requirements for ${hostId}`);
  insist(report.host===runtime!.host,`${hostId} receipt names a different host runtime`);
  insist(typeof report.runtime==='object'&&report.runtime!==null,`${hostId} runtime identity is absent`);
  for(const field of runtime!.fields)insist(typeof (report.runtime as Record<string,unknown>)[field]==='string'&&Boolean((report.runtime as Record<string,string>)[field]),`${hostId} runtime identity is missing ${field}`);
  verifyPortableResult(report,expect.cases,'umf.saga.portable-host-receipt/2');
  insist(report.corpusSha256===corpusHash,`${hostId} receipt uses a different portable corpus`);
  insist(same(report.qualificationInputs,inputHashes),`${hostId} receipt has missing, stale, or substituted qualification inputs`);
  const expectedArtifacts=expect.artifacts[hostId];
  insist(Boolean(expectedArtifacts),`no expected artifact roster for ${hostId}`);
  insist(same(Object.keys(report.artifacts??{}).sort(),Object.keys(expectedArtifacts!).sort()),`${hostId} artifact roster is missing or contains extras`);
  for(const [name,path] of Object.entries(expectedArtifacts!)){
   const artifact=report.artifacts![name]!;
   insist(artifact.path===path,`${hostId}/${name} receipt points at a substituted artifact path`);
   insist(artifact.sha256===await sha256File(resolve(expect.root,path)),`${hostId}/${name} artifact bytes differ from the tested bytes`);
  }
  if(hostId==='python'||hostId==='python-rebuilt'){
   const binding=report.installedBinding;
   insist(binding?.status==='passed',`${hostId} receipt has no verified installed-wheel binding`);
   insist(binding.wheelSha256===report.artifacts?.pythonWheel?.sha256,`${hostId} installed binding does not match the tested wheel bytes`);
   insist(/^[0-9a-f]{64}$/.test(binding.beforeNativeSha256)&&binding.beforeNativeSha256===binding.afterNativeSha256,`${hostId} installed native binding changed during vector verification`);
   insist(Number.isInteger(binding.beforeInstalledFileCount)&&binding.beforeInstalledFileCount===binding.afterInstalledFileCount,`${hostId} installed package inventory changed during vector verification`);
   insist(Number.isInteger(binding.beforePackageFileCount)&&binding.beforePackageFileCount===binding.afterPackageFileCount,`${hostId} installed package payload count changed during vector verification`);
  }
 }
}

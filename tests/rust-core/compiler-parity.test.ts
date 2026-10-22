// SPDX-License-Identifier: MIT OR Apache-2.0
import {afterAll,beforeAll,describe,expect,test} from 'bun:test';
import {mkdtemp,readFile,writeFile,unlink,rm,mkdir,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {generate} from '../../scripts/metamodel/build';
import {nativeMetamodelExecutable,rustMetamodel} from '../../scripts/metamodel/rust';
const root=resolve(import.meta.dir,'../..');
const digest=(source:string)=>createHash('sha256').update(source).digest('hex');
const baseline=JSON.parse(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r2/predecessor-outputs.json'),'utf8'));
function semantic(value:any,path:string):any {
 const copy=structuredClone(value);
 // Only these exact generator-owned locations intentionally change ownership.
 if(path.startsWith('spec/core/'))delete copy.$comment;
 if(['spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json','spec/metamodel/generated/python-shapes.json'].includes(path))delete copy.provenance;
 if(path==='spec/metamodel/generated/python-shapes.json'){delete copy.schema.$comment;delete copy.referenceSchema.$comment;}
 return copy;
}
const normalizeProvenance=(text:string)=>text.replace(/model [0-9a-f]{64}; compiler [0-9a-f]{64}/g,'model <model>; compiler <compiler>');
let outRoot:string,result:Awaited<ReturnType<typeof generate>>;
beforeAll(async()=>{outRoot=await mkdtemp(resolve(tmpdir(),'umf-r2-compiler-'));result=await generate({outputRoot:outRoot});},120_000);
afterAll(async()=>{if(outRoot)await rm(outRoot,{recursive:true,force:true});});
// @covers US-089-AC19 @covers US-089-AC24
describe('Rust metamodel authority and reproducibility',()=>{
 test('all eleven outputs preserve independent predecessor semantics',()=>{
  expect(Object.keys(result.outputs).sort()).toEqual(Object.keys(baseline.outputs).sort());
  for(const [path,record] of Object.entries(baseline.outputs) as [string,{sha256:string,contents:string}][]){
   expect(digest(record.contents)).toBe(record.sha256);
   if(path.endsWith('/manifest.json'))continue; // Verified separately: compiler ownership intentionally changes.
   if(path.endsWith('.json'))expect(semantic(JSON.parse(result.outputs[path]!),path)).toEqual(semantic(JSON.parse(record.contents),path));
   else expect(normalizeProvenance(result.outputs[path]!)).toBe(normalizeProvenance(record.contents));
  }
 });
 test('compiler closure describes Rust and build-only backend separately',()=>{
  const manifest=result.manifest;
  expect(Object.keys(manifest.sources).some(path=>path.startsWith('crates/umf-metamodel/')&&path.endsWith('.rs'))).toBe(true);
  expect(manifest.sources['Cargo.lock']).toBe(digest(require('node:fs').readFileSync(resolve(root,'Cargo.lock'),'utf8')));
  expect(manifest.backend.name).toBe('Ajv standalone');
  expect(manifest.backend.inputs['scripts/metamodel/structural.ts']).toBeTruthy();
  expect(Object.keys(manifest.outputs)).toHaveLength(10);
  for(const [path,record] of Object.entries(manifest.outputs))expect(record.sha256).toBe(digest(result.outputs[path]!));
 });
 test('second generation and no-write check have identical bytes',async()=>{
  const second=await generate({outputRoot:outRoot,check:true});
  expect(second.outputs).toEqual(result.outputs);
  for(const [path,text] of Object.entries(result.outputs))expect(await readFile(resolve(outRoot,path),'utf8')).toBe(text);
 });
 test('stale missing and extra controls fail without repairing the tree',async()=>{
  const path=resolve(outRoot,'spec/core/schema.json'),original=result.outputs['spec/core/schema.json']!;
  await writeFile(path,'stale');
  await expect(generate({outputRoot:outRoot,check:true})).rejects.toThrow('METAMODEL_STALE_OUTPUT');
  expect(await readFile(path,'utf8')).toBe('stale');
  await unlink(path);
  await expect(generate({outputRoot:outRoot,check:true})).rejects.toThrow('METAMODEL_MISSING_OUTPUT');
  expect(await Bun.file(path).exists()).toBe(false);
  await writeFile(path,original);
  const extra=resolve(outRoot,'spec/metamodel/generated/unowned.json');await mkdir(dirname(extra),{recursive:true});await writeFile(extra,'unowned');
  await expect(generate({outputRoot:outRoot,check:true})).rejects.toThrow('METAMODEL_EXTRA_OUTPUT');
  expect(await readFile(extra,'utf8')).toBe('unowned');await unlink(extra);
 });
 test('generated binding artifacts cannot alter source provenance',async()=>{
  const native=resolve(root,'bindings/core/node/.source-manifest-probe.node');
  const pkg=resolve(root,'bindings/core/wasm/pkg/.source-manifest-probe.js');
  try{
   await mkdir(dirname(pkg),{recursive:true});
   await writeFile(native,'generated native artifact');await writeFile(pkg,'generated wasm glue');
   const next=await generate({outputRoot:outRoot,check:true});
   expect(next.manifest).toEqual(result.manifest);
   expect(next.outputs).toEqual(result.outputs);
   expect(Object.keys(next.manifest.workspaceInputs).some(path=>/\.(node|so|dylib|dll|pyd|wasm)$/.test(path)||path.includes('/wasm/pkg/'))).toBe(false);
   expect(next.manifest.workspaceInputs['bindings/core/node/src/lib.rs']).toBeTruthy();
  }finally{await unlink(native).catch(()=>{});await unlink(pkg).catch(()=>{});}
 });
 test('artifact generation ignores external compiler override',async()=>{
  const previous=process.env.UMF_METAMODEL_CLI;
  try{process.env.UMF_METAMODEL_CLI='/nonexistent/umf-metamodel-override';expect((await generate({outputRoot:outRoot,check:true})).outputs).toEqual(result.outputs);}
  finally{if(previous===undefined)delete process.env.UMF_METAMODEL_CLI;else process.env.UMF_METAMODEL_CLI=previous;}
 });
 test('changed cached executable refuses rather than attesting replacement',async()=>{
  const executable=nativeMetamodelExecutable(),bytes=await readFile(executable);
  try{await chmod(executable,0o755);await writeFile(executable,'replacement');expect(()=>rustMetamodel(['shape','--stdin-wire'],'{}',{sourceBound:true})).toThrow('METAMODEL_CACHED_BINARY_CHANGED');}
  finally{await writeFile(executable,bytes);await chmod(executable,0o555);}
 });
 test('native compiler emits portable resources with an empty PATH',()=>{
  const executable=nativeMetamodelExecutable();
  const child=Bun.spawnSync([executable,'metamodel','outputs','--input',resolve(root,'spec/metamodel/umf.yaml'),'--compiler-sha256',result.manifest.provenance.compilerSha256],{cwd:outRoot,env:{PATH:'',LC_ALL:'C',TZ:'UTC'},stdout:'pipe',stderr:'pipe'});
  expect(new TextDecoder().decode(child.stderr)).toBe('');expect(child.exitCode).toBe(0);
  const actual=JSON.parse(new TextDecoder().decode(child.stdout));
  expect(actual.outputs).toHaveLength(9);
  for(const output of actual.outputs)expect(output.contents).toBe(result.outputs[output.path]);
 });
});

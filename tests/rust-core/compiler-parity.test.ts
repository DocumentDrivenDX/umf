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
let outRoot:string,result:Awaited<ReturnType<typeof generate>>;
beforeAll(async()=>{outRoot=await mkdtemp(resolve(tmpdir(),'umf-r2-compiler-'));result=await generate({outputRoot:outRoot});},120_000);
afterAll(async()=>{if(outRoot)await rm(outRoot,{recursive:true,force:true});});
// @covers US-089-AC19 @covers US-089-AC24
describe('Rust metamodel authority and reproducibility',()=>{
 test('compiler closure identifies Rust and accounts for every portable output',()=>{
  const manifest=result.manifest;
  expect(Object.keys(manifest.sources).some(path=>path.startsWith('crates/umf-metamodel/')&&path.endsWith('.rs'))).toBe(true);
  expect(manifest.sources['Cargo.lock']).toBe(digest(require('node:fs').readFileSync(resolve(root,'Cargo.lock'),'utf8')));
  expect(manifest.backend.name).toBe('Rust metamodel compiler');
  expect(Object.keys(manifest.outputs)).toHaveLength(15);
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
  expect(actual.outputs).toHaveLength(15);
  for(const output of actual.outputs)expect(output.contents).toBe(result.outputs[output.path]);
 });
});

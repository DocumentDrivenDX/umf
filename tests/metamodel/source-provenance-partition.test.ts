// SPDX-License-Identifier: MIT OR Apache-2.0
import {beforeAll,describe,expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {assertStableSourcePartition,collectSourceRosters,loadSourceBoundary,partitionRustSources,runtimeCodegenData,rustFeatureBoundaryFiles} from '../../scripts/metamodel/source-closure';
import type {SourceBoundary,SourcePartition} from '../../scripts/metamodel/source-closure';

const root=resolve(import.meta.dir,'../..');
let compilerFiles:string[],workspaceFiles:string[],boundary:SourceBoundary,actual:SourcePartition;
const digest=(files:readonly string[],values:Record<string,string>)=>createHash('sha256').update(JSON.stringify(Object.fromEntries(files.map(path=>[path,values[path]])))).digest('hex');
const withRustSource=(path:string,addition:string):SourceBoundary=>({...boundary,rustSources:[...boundary.rustSources,{path,source:addition}]});
const withFileSource=(path:string,addition:string):SourceBoundary=>({...boundary,rustSources:boundary.rustSources.map(file=>file.path===path?{...file,source:file.source+addition}:file),...(path==='crates/umf-core/src/lib.rs'?{coreLib:boundary.coreLib+addition}:{}),...(path==='crates/umf-core/src/canonical_codegen_resources.rs'?{canonicalResources:boundary.canonicalResources+addition}:{})});

beforeAll(async()=>{
 const rosters=await collectSourceRosters(root);
 compilerFiles=rosters.compilerFiles;workspaceFiles=rosters.workspaceFiles;
 const rustPaths=[...new Set([...compilerFiles,...workspaceFiles])].filter(path=>path.endsWith('.rs'));
 boundary=await loadSourceBoundary(root,rustPaths,process.env);
 actual=partitionRustSources(compilerFiles,workspaceFiles,boundary);
});

describe('metamodel source provenance partition',()=>{
 test('actual overlapping repository rosters normalize to one stable disjoint partition',()=>{
  const overlap=compilerFiles.filter(path=>workspaceFiles.includes(path));
  expect(compilerFiles.length).toBeGreaterThan(1000);
  expect(workspaceFiles.length).toBeGreaterThan(2000);
  expect(overlap.length).toBeGreaterThan(1000);
  expect(overlap).toContain(runtimeCodegenData);
  expect(actual.compilerInputs).not.toContain(runtimeCodegenData);
  expect(actual.workspaceInputs).toContain(runtimeCodegenData);
  expect(actual.compilerInputs.some(path=>actual.workspaceInputs.includes(path))).toBe(false);
  expect([...new Set([...actual.compilerInputs,...actual.workspaceInputs])].sort()).toEqual([...new Set([...compilerFiles,...workspaceFiles])].sort());
  expect(()=>assertStableSourcePartition(actual,partitionRustSources(compilerFiles,workspaceFiles,boundary))).not.toThrow();
  const extra='crates/umf-core/src/new-roster-input.rs';
  const changed=partitionRustSources([...compilerFiles,extra],[...workspaceFiles,extra],withRustSource(extra,'pub fn new_roster_input() {}'));
  expect(()=>assertStableSourcePartition(actual,changed)).toThrow('METAMODEL_SOURCE_PARTITION_CHANGED_DURING_GENERATION');
 });

 test('DATA mutation changes retained workspace custody while compiler inputs remain stable',()=>{
  const data=boundary.rustSources.find(file=>file.path===runtimeCodegenData)!.source;
  const beforeValues=Object.fromEntries([...actual.compilerInputs,...actual.workspaceInputs].map(path=>[path,path===runtimeCodegenData?data:path]));
  const afterValues={...beforeValues,[runtimeCodegenData]:data+'\n// custody mutation\n'};
  expect(digest(actual.compilerInputs,beforeValues)).toBe(digest(actual.compilerInputs,afterValues));
  expect(digest(actual.workspaceInputs,beforeValues)).not.toBe(digest(actual.workspaceInputs,afterValues));
  const compilerMutation={...beforeValues,'crates/umf-core/src/lib.rs':beforeValues['crates/umf-core/src/lib.rs']+'\n// compiler mutation'};
  expect(digest(actual.compilerInputs,beforeValues)).not.toBe(digest(actual.compilerInputs,compilerMutation));
 });

 test('refuses direct, qualified, include, and renamed test-like DATA consumers',()=>{
  const lib='crates/umf-core/src/lib.rs',parent='crates/umf-core/src/canonical_codegen_resources.rs';
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(lib,'\nfn injected(){ crate::canonical_codegen_resources::data(); }\n'))).toThrow();
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(lib,'\ninclude!("canonical_codegen_literals.rs");\n'))).toThrow();
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(parent,'\ninclude_str!("canonical_codegen_literals.rs");\n'))).toThrow();
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(parent,'\ninclude_bytes!("canonical_codegen_literals.rs");\n'))).toThrow();
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withRustSource('crates/umf-core/src/canonical_codegen_independent_tests.rs','#[path="canonical_codegen_literals.rs"] mod data;'))).toThrow();
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withRustSource('crates/umf-core/src/new_consumer.rs','pub use crate::canonical_codegen_resources::data;'))).toThrow();
  const unknown='crates/umf-core/src/unknown_include.rs';
  expect(()=>partitionRustSources([...compilerFiles,unknown],[...workspaceFiles,unknown],withRustSource(unknown,'include!(concat!("canonical_codegen_", "literals.rs"));'))).toThrow();
 });

 test('resolves DATA paths relative to an unchanged, unpinned compiler source',()=>{
  const value='crates/umf-core/src/value.rs';
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\nconst GEN1_EDGE: &str = include_str!("./canonical_codegen_literals.rs");\n'))).toThrow('METAMODEL_SOURCE_PARTITION_CONSUMER_EDGE');
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\n#[path = "./canonical_codegen_literals.rs"] mod gen1_edge;\n'))).toThrow('METAMODEL_SOURCE_PARTITION_CONSUMER_EDGE');
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\nconst GEN1_EDGE: &[u8] = include_bytes!("./canonical_codegen_literals.rs");\n'))).toThrow('METAMODEL_SOURCE_PARTITION_CONSUMER_EDGE');
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\ninclude!("./canonical_codegen_literals.rs");\n'))).toThrow('METAMODEL_SOURCE_PARTITION_CONSUMER_EDGE');
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\nconst GEN1_EDGE: &str = include_str!["./canonical_codegen_literals.rs"];\n'))).toThrow('METAMODEL_SOURCE_PARTITION_CONSUMER_EDGE');
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\nconst GEN1_EDGE: &str = include_str!{"./canonical_codegen_literals.rs"};\n'))).toThrow('METAMODEL_SOURCE_PARTITION_CONSUMER_EDGE');
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\n#[cfg_attr(feature = "metamodel-compiler", path = "./canonical_codegen_literals.rs")] mod gen1_edge;\n'))).toThrow('METAMODEL_SOURCE_PARTITION_CONSUMER_EDGE');
 });

 test('refuses path spellings that cannot be normalized statically',()=>{
  const value='crates/umf-core/src/value.rs';
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\nconst GEN1_EDGE: &str = include_str!(concat!("./canonical_codegen_", "literals.rs"));\n'))).toThrow('METAMODEL_SOURCE_PARTITION_UNKNOWN_INCLUDE');
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\nconst GEN1_EDGE: &str = include_str![concat!("./canonical_codegen_", "literals.rs")];\n'))).toThrow('METAMODEL_SOURCE_PARTITION_UNKNOWN_INCLUDE');
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\n#[path = concat!("./canonical_codegen_", "literals.rs")] mod gen1_edge;\n'))).toThrow('METAMODEL_SOURCE_PARTITION_UNKNOWN_PATH');
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\n#[cfg_attr(feature = "metamodel-compiler", path = concat!("./canonical_codegen_", "literals.rs"))] mod gen1_edge;\n'))).toThrow('METAMODEL_SOURCE_PARTITION_UNKNOWN_PATH');
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,withFileSource(value,'\nconst GEN1_EDGE: &str = include_str!("./canonical_codegen_\\u{6c}iterals.rs");\n'))).toThrow('METAMODEL_SOURCE_PARTITION_UNKNOWN_INCLUDE');
 });

 test('refuses any Cargo feature-closure addition even when approved declarations remain',()=>{
  expect(rustFeatureBoundaryFiles).toContain('crates/umf-tagged-wire/Cargo.toml');
  const appendCargo=(path:string,addition:string):SourceBoundary=>({...boundary,cargoInputs:boundary.cargoInputs.map(file=>file.path===path?{...file,source:file.source+addition}:file)});
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,appendCargo('crates/umf-tagged-wire/Cargo.toml',`\n[target.'cfg(unix)'.dependencies]\numf-core = { path = "../umf-core", features = ["full-core"] }\n`))).toThrow();
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,appendCargo('crates/umf-core/Cargo.toml',`\n[target.'cfg(unix)'.dependencies]\numf-tagged-wire = { path = "../umf-tagged-wire", features = ["full-core"] }\n`))).toThrow();
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,{...boundary,featureOverrides:{RUSTFLAGS:'--cfg feature="full-core"'}})).toThrow();
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,{...boundary,featureOverrides:{CARGO_ENCODED_RUSTFLAGS:'--cfg\u001ffeature="full-core"'}})).toThrow();
  expect(()=>partitionRustSources(compilerFiles,workspaceFiles,{...boundary,featureOverrides:{CARGO_BUILD_TARGET:'x86_64-unknown-linux-gnu'}})).toThrow();
 });

 test('refuses unknown or duplicate roster leaves without dropping other inputs',()=>{
  expect(()=>partitionRustSources(compilerFiles.filter(path=>path!==runtimeCodegenData),workspaceFiles,boundary)).toThrow();
  expect(()=>partitionRustSources([...compilerFiles,runtimeCodegenData],workspaceFiles,boundary)).toThrow();
  expect(()=>partitionRustSources(compilerFiles,[...workspaceFiles,runtimeCodegenData],boundary)).toThrow();
  const extra='crates/umf-core/src/new-roster-input.rs';
  expect(partitionRustSources([...compilerFiles,extra],[...workspaceFiles,extra],withRustSource(extra,'pub fn added_input() {}')).compilerInputs).toContain(extra);
 });
});

// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {inspectCoreAuthority,inspectCoreDistribution,r5PredecessorRejectionControls} from '../../scripts/check-core-authority';
const inspect=(path:string,source:string)=>inspectCoreAuthority([{path,source}]);
// @covers US-089-AC19 @covers US-089-AC22 @covers US-089-AC24
describe('current-core authority boundaries',()=>{
 test('rejects static and dynamic imports of retired resources',()=>{
  for(const code of ["import schema from '../../spec/core/bit128-document.schema.json'", "export * from './field-transition'", "const module=import('./key-transition')"]){
   expect(inspect('src/model/example.ts',code).some(message=>message.includes('imports retired'))).toBe(true);
  }
 });
 test('retired source cannot quietly remain distributed',()=>{
  expect(inspect('spec/core/semantic-types-document.schema.json','{}')).toEqual(['spec/core/semantic-types-document.schema.json: retired core path remains active']);
  expect(inspect('docs/helix/05-deploy/microsite/catalog-defaults.js','')).toHaveLength(1);
  expect(inspect('docs/helix/05-deploy/microsite/schema-browser.html','')).toHaveLength(1);
  expect(inspect('docs/helix/05-deploy/reference/examples/minimal.json','{}')).toHaveLength(1);
 });
 test('compiler cannot depend on generated core admission',()=>{
  for(const target of ['../../src/generated/core-model','../../src/model/document','../../src/index','../../spec/core/schema.json'])expect(inspect('scripts/metamodel/build.ts',`import value from '${target}'`).some(message=>message.includes('derived core authority'))).toBe(true);
  expect(inspect('scripts/metamodel/build.ts',"import {copyJson} from '../../src/model/json'" )).toEqual([]);
  expect(inspect('scripts/metamodel/build.ts',"import {assertConstraintProgram} from '../../src/validation/constraint-language'" )).toEqual([]);
 });
 test('runtime cannot reach host compiler or inert historical evidence',()=>{
  expect(inspect('src/validation/document.ts',"import value from '../../scripts/metamodel/compiler'" )[0]).toContain('host metamodel compiler');
  expect(inspect('src/validation/document.ts',"import value from '../../docs/helix/04-build/evidence/baseline/result.json'" )[0]).toContain('historical evidence');
  expect(inspect('src/validation/document.ts','import(path)')[0]).toContain('nonliteral dependency');
 });
 test('old dispatch and constructed core markers reject, independent native versions survive',()=>{
  for(const code of ["const d={umf:'0.1.0'}", "doc.umf='0.9.0'", "doc['umf']==='0.8.0'", "['0.9.0','0.10.0'].includes(doc.umf)", "interface D {umf:'0.1.0'|'0.10.0'}", "const p={coreVersion:'0.1.0'}"])expect(inspect('src/model/example.ts',code).length).toBeGreaterThan(0);
  expect(inspect('src/model/example.ts',"const extension={version:'0.1.0'}; const receipt={version:'1.0.0'}; const d={umf:'0.10.0'}")).toEqual([]);
 });
 test('transitive compiler bootstrap dependencies reject while erased type dependencies do not',()=>{
  const base=[{path:'scripts/metamodel/build.ts',source:"import {copy} from '../../src/model/json'"},{path:'src/model/json.ts',source:"import {policy} from '../generated/core-model'"},{path:'src/generated/core-model.ts',source:'export const policy={}'}];
  expect(inspectCoreAuthority(base).some(message=>message.includes('transitive bootstrap'))).toBe(true);
  expect(inspectCoreAuthority(base.map(file=>file.path==='src/model/json.ts'?{...file,source:"import type {Document} from '../generated/core-model'"}:file))).toEqual([]);
 });
 test('host producers and schema generators cannot reintroduce old core authority',()=>{
  for(const path of ['scripts/example-schema.ts','tools/security/example.ts','docs/helix/05-deploy/microsite/demo.ts','docs/helix/05-deploy/reference/example.ts','docs/helix/05-deploy/schema-browser/example.ts'])for(const code of ["const p={coreVersion:'0.1.0'}","const schema={properties:{umf:{const:'0.8.0'}}}","const schema={properties:{coreVersion:{enum:['0.8.0']}}}","const p={coreVersions:['0.8.0']}","const schema={$id:'urn:umf:core:0.8.0'}","doc.umf==='0.8.0'"])expect(inspect(path,code).length).toBeGreaterThan(0);
  expect(inspect('scripts/example-schema.ts',"const p={version:'0.1.0',coreVersion:'0.10.0'}")).toEqual([]);
 });
 test('explicit refusal controls cannot exempt unguarded or changed producers',()=>{
  const path='tools/security/record-type-journal-cases.ts';
  const source="const older={...structuredClone(f.base),umf:'0.6.0'} as unknown as Document;refuses('older envelope unavailable',()=>inspectCoreRecordTypeJournal(older,f.current,f.events),'CORE_TYPE_JOURNAL_SOURCE');";
  expect(inspect(path,source)).toEqual([]);
  expect(inspect(path,source+"const accepted={umf:'0.6.0'}").some(x=>x.includes('constructs a retired'))).toBe(true);
  expect(inspect(path,source.replace("refuses(","accepts(")).length).toBeGreaterThan(0);
  expect(inspect(path,source+source).length).toBeGreaterThan(0);
  expect(inspect(path,'')).toHaveLength(1);
 });
 test('R5 frozen predecessor refusals are exact, case-specific controls',async()=>{
  const paths=[...new Set(r5PredecessorRejectionControls.map(control=>control.path))];
  const files=await Promise.all(paths.map(async path=>({path,source:await readFile(resolve(import.meta.dir,'../..',path),'utf8')})));
  expect(r5PredecessorRejectionControls).toHaveLength(19);
  expect(inspectCoreAuthority(files)).toEqual([]);
  const target=files.find(file=>file.path==='scripts/rust-migration/r5/freeze-core-keys.ts')!;
  const withUnlistedMarker=files.map(file=>file.path===target.path?{...file,source:file.source+"\nconst unlisted={umf:'0.8.0'};\n"}:file);
  expect(inspectCoreAuthority(withUnlistedMarker).some(issue=>issue.includes('scripts/rust-migration/r5/freeze-core-keys.ts')&&issue.includes('constructs a retired core marker'))).toBe(true);
 });
 test('each R5 predecessor control becomes stale when its exact snippet changes or disappears',async()=>{
  const paths=[...new Set(r5PredecessorRejectionControls.map(control=>control.path))];
  const files=await Promise.all(paths.map(async path=>({path,source:await readFile(resolve(import.meta.dir,'../..',path),'utf8')})));
  for(const control of r5PredecessorRejectionControls){
   const original=files.find(file=>file.path===control.path)!;
   expect(original.source.indexOf(control.source)).toBe(original.source.lastIndexOf(control.source));
   for(const replacement of [control.source.replace(/0\.[1-9]\.0/g,'0.10.0'),'']){
    const changed=files.map(file=>file.path===control.path?{...file,source:file.source.replace(control.source,replacement)}:file);
    expect(inspectCoreAuthority(changed)).toContain(control.path+': stale or changed explicit core-rejection control');
   }
  }
 });
 test('dynamic document identities require the generated current version',()=>{
  for(const source of ["const refs=versions.map(v=>({$ref:'urn:umf:core:'+v}))",'const ref=`urn:umf:core:0.${i+1}.0`','const ref=`urn:umf:core:${version}`'])expect(inspect('scripts/example-schema.ts',source).some(issue=>issue.includes('noncurrent dynamic core document'))).toBe(true);
  for(const source of ["const ref='urn:umf:core:'+CURRENT_CORE_VERSION",'const ref=`urn:umf:core:${CURRENT_CORE_VERSION}#/$defs/element`',"const ref='urn:umf:core:avro-field-classification:1.0.0'"])expect(inspect('scripts/example-schema.ts',source)).toEqual([]);
 });
 test('retired receipt resource identities reject without banning live independent versions',()=>{
  for(const source of ["const ref='urn:umf:core:key-operation:1.0.0#/$defs/declaration'","const schema={$id:'urn:umf:core:key-tuple-operation:3.0.0'}","const schema=ref('urn:umf:core:kind-operation:4.0.0')"])expect(inspect('scripts/example-schema.ts',source).some(issue=>issue.includes('retired core schema identity'))).toBe(true);
  expect(inspect('spec/core/example.schema.json',JSON.stringify({$ref:'urn:umf:core:key-operation:1.0.0#/$defs/declaration'})).some(issue=>issue.includes('retired core schema identity'))).toBe(true);
  expect(inspect('scripts/example-schema.ts',"const refs=['urn:umf:core:key-operation:2.0.0','urn:umf:core:relationship-operation:1.0.0','urn:umf:core:avro-field-classification:1.0.0']")).toEqual([]);
 });
 test('former document-profile alternatives cannot duplicate the current core resource',()=>{
  for(const key of ['oneOf','anyOf','allOf'])expect(inspect('spec/core/example.schema.json',JSON.stringify({[key]:[{$ref:'urn:umf:core:0.10.0'},{$ref:'urn:umf:core:0.10.0'}]})).some(issue=>issue.includes('duplicate core document reference branch'))).toBe(true);
  expect(inspect('spec/core/example.schema.json',JSON.stringify({oneOf:[{$ref:'urn:umf:core:0.10.0'},{$ref:'urn:umf:core:avro-field-classification:1.0.0'}]}))).toEqual([]);
 });
 test('Python host producers reject explicit retired marker pins and refs',()=>{
  for(const path of ['scripts/schema.py','tools/security/request.py','python/src/umf/validation.py','python/umf_access/src/umf_access/unified/__init__.py'])for(const source of ["d={'umf':'0.8.0'}","p=dict(coreVersion='0.1.0')","p={'umfVersion':'0.8.0'}","schema={'$ref':'urn:umf:core:0.8.0'}","schema=Path('spec/core/schema-properties-document.schema.json').read_text()"])expect(inspect(path,source).length).toBeGreaterThan(0);
  expect(inspect('scripts/schema.py',"p={'version':'0.1.0','coreVersion':CURRENT_CORE_VERSION};native='core-literal/0.8'")).toEqual([]);
  expect(inspect('tools/security/weft_protocol_evidence.py',"model=Path('/Users/erik/.codex/worktrees/1598/umf/spec/core/schema-properties-document.schema.json')")).toEqual([]);
  expect(inspect('tools/security/weft_protocol_evidence.py',"pin={'umfVersion':'0.8.0'}")).toHaveLength(1);
 });
 test('schema document refs and package core identity reject independently versioned receipts do not',()=>{
  expect(inspect('spec/core/operation.schema.json',JSON.stringify({$ref:'urn:umf:core:0.7.0#/$defs/element'}))[0]).toContain('retired core document');
  expect(inspect('spec/extensions/example/package.json',JSON.stringify({coreVersion:'0.1.0',version:'0.1.0'}))[0]).toContain('retired core package');
  expect(inspect('spec/core/operation.schema.json',JSON.stringify({properties:{umf:{const:'0.8.0'}}}))[0]).toContain('retired core discriminator');
  expect(inspect('spec/compilation/profile.json',JSON.stringify({coreVersions:['0.8.0']}))[0]).toContain('retired core profile');
  expect(inspect('spec/core/operation.schema.json',JSON.stringify({properties:{umfVersion:{enum:['0.8.0']}}}))[0]).toContain('retired core enum');
  expect(inspect('spec/projections/report.schema.json',JSON.stringify({properties:{sourceVersions:{properties:{core:{const:'0.7.0'}}}}}))[0]).toContain('retired source core identity');
  expect(inspect('spec/projections/report.schema.json',JSON.stringify({properties:{sourceVersions:{properties:{native:{const:'0.7.0'}}}}}))).toEqual([]);
  expect(inspect('spec/core/operation.schema.json',JSON.stringify({$id:'urn:umf:core:field-operation:1.0.0',version:'1.0.0'}))).toEqual([]);
 });
 test('published inventories reject stale hosts, wheel schemas and inert archives',()=>{
  expect(inspectCoreDistribution(['explorer.html','catalog-defaults.js','umf/spec/core/field-document.schema.json','spec/history/core/schema.json'])).toHaveLength(4);
  expect(inspectCoreDistribution(['dist/src/model/key-transition.js','dist/src/model/key-transition.d.ts','src/model/bit128-transition.ts'])).toHaveLength(3);
  expect(inspectCoreDistribution(['tools/security/record-home-shape-probe.ts','research/tools/tools/security/truss-graph-native-stage.ts','tools/security/truss-graph-native-stage-probe.py','pkg/tools/security/truss-graph-native-stage-typecheck.json'])).toHaveLength(4);
  expect(inspectCoreDistribution(['src/validation/facets.js','src/validation/facets.d.ts'])).toHaveLength(2);
  expect(inspectCoreDistribution(['schema-browser.html'])).toHaveLength(1);
  expect(inspectCoreDistribution(['explorer.js','explorer.css','browser-style.css','components.css','chunk-08fvdevk.js'])).toHaveLength(5);
  expect(inspectCoreDistribution(['reference/core.html','schema-browser/assets/index.html','schema-browser/assets/explorer.js','schema-browser/assets/components.css','schema-browser/assets/chunk-08fvdevk.js','truss-catalog-worker.js','style.css','spec/core/schema.json','umf/spec/core/schema.json'])).toEqual([]);
 });
 test('browser enforcement rejects host and dynamic code primitives',()=>{
  for(const code of ['Bun.file(path)','new Function(code)','eval(code)','process.env.KEY'])expect(inspect('src/validation/constraint-kernel.ts',code)[0]).toContain('host or dynamic-code');
  expect(inspect('src/validation/constraint-kernel.ts','const matches=Object.hasOwn(value,key)')).toEqual([]);
 });
});

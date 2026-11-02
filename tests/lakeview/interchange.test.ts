// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createEngine} from '../../bindings/core/node/index.js';
import {coreSchema,semanticTypeReferenceSchema,extensionPackageSchema,coreConstraints,domainPolicy} from '../../src/generated/core-model';
import {importLakeviewDashboardBytes,exportLakeviewDashboardBytes,importLakeviewDashboard,exportLakeviewDashboard,lakeviewRegistry,inspectLakeview,projectLakeviewToLegacyDashboard,lakeviewPackage} from '../../src/adapters/lakeview';
import {Registry} from '../../src/registry/registry';
import {readDocument,writeDocument} from '../../src/model/document';
import {inspectExtensionKinds} from '../../src/model/extension-kinds';
import {selectCoreElements} from '../../src/model/selection';
import {copyJson} from '../../src/model/json';
import type {Document} from '../../src/model/types';
const runtime=createEngine({coreSchema,referenceSchema:semanticTypeReferenceSchema,packageSchema:extensionPackageSchema,constraints:coreConstraints,domainPolicy});
const options={id:'dashboard:marketing-campaign',title:'Marketing Campaign Performance',namespace:'marketing'};
const paths=['marketing-campaign','lexical-quirks','empty-sections'];
const originals=await Promise.all(paths.map(async name=>({name,bytes:await Bun.file('fixtures/lakeview/'+name+'.lvdash.json').bytes()})));
const load=(bytes=originals[0]!.bytes)=>importLakeviewDashboardBytes(bytes,options,runtime);
const native=(owner:any)=>owner.extensions?.['umf.lakeview'];

for(const original of originals)test('@covers US-093-AC1: original file bytes survive import/export and UMF JSON/YAML: '+original.name,()=>{
  const {document}=load(original.bytes);
  // Compare the actual original bytes directly. Never normalize either side.
  expect(exportLakeviewDashboardBytes(document,runtime)).toEqual(original.bytes);
  for(const format of ['json','yaml'] as const){
    const restored=readDocument(writeDocument(document,format),format);
    expect(exportLakeviewDashboardBytes(restored,runtime)).toEqual(original.bytes);
  }
},60_000);

test('@covers US-093-AC2: generic discovery and core selection see Records/Fields without a parallel field dictionary',()=>{
  const {document}=load(),registry=lakeviewRegistry(runtime);
  const inspection=inspectExtensionKinds(document,registry);
  expect(inspection.entries[0]!.reference).toEqual({extension:'umf.lakeview',version:'0.2.0',kind:'dashboard'});
  expect(registry.listKinds().definitions.map(d=>d.reference.kind)).toEqual(['dashboard','data','dataset','field','layout-item','page','query-result']);
  expect(inspection.sourceValidation.valid).toBe(true);expect(inspection.complete).toBe(false);
  const data=document.modules.find(m=>native(m)?.kind==='data')!;
  const dataset=data.elements.find(e=>e.id==='ds_metric')!;
  expect(dataset.kind).toBe('record');expect(dataset.members!.length).toBeGreaterThan(0);
  const selected=selectCoreElements(document,{references:'transitive',identities:[{module:data.id,element:dataset.id}]},registry);
  expect(selected.selection.some(e=>e.element.kind==='field'&&e.element.name==='Metric Value')).toBe(true);
  const fields=document.modules.flatMap(m=>m.elements).filter(e=>e.kind==='field');
  expect(fields.length).toBeGreaterThan(20);
  expect(fields.every(e=>e.scalarType===undefined&&e.nullability===undefined&&e.cardinality===undefined)).toBe(true);
  expect(document.modules.flatMap(m=>m.elements).every(e=>native(e)?.fields===undefined&&e.extensions['umf.dashboard']===undefined)).toBe(true);
  const page=document.modules.find(m=>m.id==='overview')!;
  const item=page.elements.find(e=>e.id==='w-101-impressions')!;
  const outputs=selectCoreElements(document,{references:'transitive',identities:[{module:page.id,element:item.id}]},registry);
  expect(outputs.selection.some(e=>native(e.element)?.kind==='query-result'&&e.element.kind==='record')).toBe(true);
  expect(outputs.selection.some(e=>native(e.element)?.role==='query-output'&&e.element.kind==='field')).toBe(true);
},60_000);

test('@covers US-093-AC3: unknown native content and opaque numeric/expression lexemes are retained with explicit limits',()=>{
  const original=originals[1]!,{document,issues}=load(original.bytes);
  expect(document.modules.map(m=>m.id)).toEqual(['data_2','data']);
  expect(issues.map(i=>i.code)).toContain('LAKEVIEW_QUERY_OPAQUE');
  expect(issues.map(i=>i.code)).toContain('LAKEVIEW_SCHEMA_PARTIAL');
  expect(issues.map(i=>i.code)).toContain('LAKEVIEW_NATIVE_SEMANTICS_UNVERIFIED');
  expect(issues.every(i=>i.retainedInSource)).toBe(true);
  const stored=native(document).originalText as string;
  expect(stored.startsWith('\ufeff\r\n')).toBe(true);
  expect(stored).toContain('9007199254740993123456789');expect(stored).toContain('0.10000000000000001');expect(stored).toContain('1e400');
  expect(stored).toContain('\\u0061\\/\\ud800');expect(stored.endsWith('\t\r\n\r\n')).toBe(true);
  expect(exportLakeviewDashboardBytes(document,runtime)).toEqual(original.bytes);
});

test('@covers US-093-AC4: core/native edits, unknown representation and broken references cannot silently export old bytes',()=>{
  const {document}=load(originals[1]!.bytes);
  for(const mutate of [
    (d:Document)=>{d.modules[0]!.elements.find(e=>e.kind==='field')!.name='changed'},
    (d:Document)=>{d.modules[0]!.elements.find(e=>e.kind==='record')!.members=[]},
    (d:Document)=>{d.modules[0]!.elements.find(e=>e.kind==='field')!.scalarType='string'},
    (d:Document)=>{native(d.modules[0]!.elements.find(e=>native(e)?.kind==='dataset')).native.members.name.value='changed'},
    (d:Document)=>{native(d).order.reverse()},
    (d:Document)=>{native(d).futureRepresentation={keep:true}},
    (d:Document)=>{d.modules[1]!.elements[0]!.references=[{module:'missing',element:'missing',role:'lakeview-declaration'}]},
    (d:Document)=>{native(d).kind='page'},
  ]){
    const changed=copyJson(document) as unknown as Document;mutate(changed);
    expect(()=>exportLakeviewDashboard(changed,runtime)).toThrow('changed');
  }
  const wrong=copyJson(document) as unknown as Document;native(wrong).kind='page';
  expect(inspectLakeview(wrong,runtime).diagnostics.map(d=>d.code)).toContain('EXTENSION_KIND_SCOPE');
  const missing=copyJson(document) as unknown as Document;delete native(missing).kind;
  expect(inspectLakeview(missing,runtime).valid).toBe(false);
  const broken=copyJson(document) as unknown as Document;native(broken).originalText='invalid JSON';
  expect(inspectLakeview(broken,runtime).diagnostics.map(d=>d.code)).toContain('LAKEVIEW_SOURCE_INVALID');
  expect(()=>importLakeviewDashboard('{"datasets":[],"datasets":[]}',options,runtime)).toThrow();
  expect(()=>importLakeviewDashboardBytes(new Uint8Array([0xff,0xfe]),options,runtime)).toThrow();
},60_000);

test('PR42 neutral projection remains an explicit legacy compatibility view, independent of native round-trip representation',()=>{
  const view=JSON.parse(new TextDecoder().decode(originals[0]!.bytes));
  const ids={data:'data',datasets:view.datasets.map((d:any)=>d.name),pages:view.pages.map((p:any)=>({id:p.name,items:p.layout.map((l:any)=>l.widget.name)}))};
  const legacy=projectLakeviewToLegacyDashboard(view,ids,{title:options.title});
  expect((legacy.root as any).kind).toBe('dashboard');expect(legacy.elements.size).toBeGreaterThan(20);
  const {document}=load();expect(document.vocabularies['umf.dashboard']).toBeUndefined();
  expect(exportLakeviewDashboardBytes(document,runtime)).toEqual(originals[0]!.bytes);
});

test('native validator selection is an explicit caller capability; metadata cannot activate it',()=>{
  const p=copyJson(lakeviewPackage) as any;p.nativeValidator='lakeview/0.2.0';
  const registry=new Registry(runtime).register(p,undefined,{kinds:true});
  expect(registry.registrations()[0]!.nativeValidator).toBeUndefined();
  expect(()=>new Registry(runtime).register(p,undefined,{kinds:true,nativeValidator:'future/9'})).toThrow();
  const wrong=copyJson(lakeviewPackage) as any;wrong.id='another.extension';
  expect(()=>new Registry(runtime).register(wrong,undefined,{kinds:true,nativeValidator:'lakeview/0.2.0'})).toThrow();
  expect(()=>new Registry(runtime).register(lakeviewPackage,()=>[],{kinds:true,nativeValidator:'lakeview/0.2.0'})).toThrow();
  const atomic=new Registry(runtime);
  expect(()=>atomic.register(p,undefined,{kinds:true,nativeValidator:'future/9'})).toThrow();
  expect(atomic.get('umf.lakeview','0.2.0')).toBeUndefined();
});

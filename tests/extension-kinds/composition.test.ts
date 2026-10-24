// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createEngine} from '../../bindings/core/node/index.js';
import {coreSchema,semanticTypeReferenceSchema,extensionPackageSchema,coreConstraints,domainPolicy} from '../../src/generated/core-model';
import manifest from '../../fixtures/extension-kinds/dashboard-package.json';
import {Registry} from '../../src/registry/registry';
import {readDocument,writeDocument} from '../../src/model/document';
import {validateDocument} from '../../src/validation/document';
import {inspectExtensionKinds} from '../../src/model/extension-kinds';
import {selectCoreElements} from '../../src/model/selection';
import {copyJson} from '../../src/model/json';
import type {Document,ExtensionPackage} from '../../src/model/types';
import {fixtureSemantics} from './support';
const runtime=createEngine({coreSchema,referenceSchema:semanticTypeReferenceSchema,packageSchema:extensionPackageSchema,constraints:coreConstraints,domainPolicy});
const registry=()=>new Registry(runtime).register(manifest as ExtensionPackage,fixtureSemantics,{kinds:true});
const load=()=>readDocument(awaitSource,'yaml');
const awaitSource=await Bun.file('fixtures/extension-kinds/dashboard.yaml').text();

// @covers US-904-AC2
// @covers US-904-AC5
test('@covers US-904-AC1, US-904-AC2, US-904-AC5: generic discovery composes with core Record/Field consumers',()=>{
  const r=registry(),doc=load(),inspection=inspectExtensionKinds(doc,r);
  expect(r.listKinds().definitions.map(d=>d.reference.kind)).toEqual(['dashboard','data','dataset','filter','visual']);
  expect(inspection.entries.map(e=>e.reference.kind)).toEqual(['dashboard','data','dataset','visual','filter']);
  expect(inspection.entries[0]?.owner).toEqual({scope:'document'});
  expect(inspection.sourceValidation.valid).toBe(true);expect(inspection.complete).toBe(false);
  expect(inspection.sourceValidation.diagnostics.some(d=>d.code==='EXAMPLE_QUERY_OPAQUE')).toBe(true);
  const selected=selectCoreElements(doc,{references:'transitive',identities:[{module:'sales',element:'sales-row'}]},r);
  expect(selected.selection.map(e=>e.element.id)).toEqual(['channel','revenue','sales-row']);
  expect(selected.selection.filter(e=>e.element.kind==='field').map(e=>e.element.scalarType)).toEqual(['string','decimal']);
  const dataset=doc.modules[0]!.elements[2]!;
  expect((dataset.extensions['example.dashboard'] as any).fields).toBeUndefined();
  expect(dataset.kind).toBe('record');
  expect(doc.modules[0]!.elements[3]!.kind).toBeUndefined();
},60_000);

test('@covers US-904-AC3: ordinary validation rejects scope, tag and core field-binding errors',()=>{
  const r=registry();
  for(const [mutate,code] of [
    [(d:Document)=>{(d.extensions!['example.dashboard'] as any).kind='visual'},'EXTENSION_KIND_SCOPE'],
    [(d:Document)=>{delete (d.extensions!['example.dashboard'] as any).kind},'EXTENSION_KIND_REQUIRED'],
    [(d:Document)=>{(d.extensions!['example.dashboard'] as any).kind='future'},'EXTENSION_KIND_UNKNOWN'],
    [(d:Document)=>{(d.modules[0]!.elements[3]!.extensions['example.dashboard'] as any).field.element='sales-row'},'EXAMPLE_DASHBOARD_BINDING'],
  ] as const){const d=load();mutate(d);const checked=validateDocument(d,r);expect(checked.valid).toBe(false);expect(checked.diagnostics.map(v=>v.code)).toContain(code);}
},60_000);

// @covers US-904-AC6
// @covers US-904-AC7
test('@covers US-904-AC4, US-904-AC6, US-904-AC7: unknowns and independent classifications survive JSON/YAML',()=>{
  const doc=load(),r=registry();
  for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format);expect(restored).toEqual(doc);expect(inspectExtensionKinds(restored,r).entries).toEqual(inspectExtensionKinds(doc,r).entries);}
  const missing=inspectExtensionKinds(doc,new Registry(runtime));expect(missing.entries).toEqual([]);expect(missing.coverage.every(c=>c.status==='unavailable')).toBe(true);
  const other=copyJson(manifest) as unknown as ExtensionPackage;other.id='other.dashboard';
  r.register(other,()=>[],{kinds:true});doc.vocabularies[other.id]={version:other.version};doc.extensions![other.id]={kind:'dashboard',title:'Competing meaning'};
  expect(inspectExtensionKinds(doc,r).entries.filter(e=>e.reference.kind==='dashboard').map(e=>e.reference.extension)).toEqual(['example.dashboard','other.dashboard']);
  const legacy=new Registry(runtime).register(manifest as ExtensionPackage,fixtureSemantics);
  expect(inspectExtensionKinds(load(),legacy).entries).toEqual([]);
  expect(validateDocument(load(),legacy).valid).toBe(true);
},60_000);

test('@covers US-904-AC9: lookup snapshots, atomic failures and explicit shared-runtime construction',()=>{
  const r=registry(),reference={extension:manifest.id,version:manifest.version,kind:'dashboard'};
  const definition=r.getKind(reference)!;definition.title='mutated';expect(r.getKind(reference)!.title).toBe('Dashboard');
  expect(r.getKind({...reference,version:'99.0.0'})).toBeUndefined();
  const bad=copyJson(manifest) as any;bad.id='broken';bad.kindCatalog.definitions.dataset.scopes=['document'];
  // Other element kinds still cover element scope: make one scope fall outside the package.
  bad.kindCatalog.definitions.dataset.scopes=['not-a-scope'];
  expect(()=>r.register(bad,()=>[],{kinds:true})).toThrow();expect(r.get('broken','1.0.0')).toBeUndefined();
  expect(()=>new Registry().register(manifest as ExtensionPackage,fixtureSemantics,{kinds:true})).toThrow('shared native/WASM');
},60_000);

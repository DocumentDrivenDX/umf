// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import model from '../../fixtures/access/search/unity-catalog-model.json';
import physical from '../../fixtures/access/search/unity-catalog-binding.json';
import {inspectAccessViews} from '../../src/compilation/admission/access/index';
import {rawTableBindingProfiles} from '../../src/extensions/binding/raw-profiles';
import type {Document} from '../../src/model/types';

function fixture(platform='unity-catalog'){
 const document=structuredClone(model) as unknown as Document,binding=structuredClone(physical) as unknown as Document;
 const access=document.modules[0]!.extensions!['umf.access'] as any,payload=binding.extensions!['umf.binding'] as any;
 access.columns[0].target.platform=platform;payload.target.system=platform;
 if(platform==='lakebase'){
  access.columns[0].target.majorVersion='18';payload.target.version='18';
  const types:Record<string,string>={id:'text',body:'text',embedding:'vector(3)',count:'bigint',amount:'numeric(38,10)',payload:'bytea'};
  for(const column of access.columns[0].columns)column.type=types[column.field.element];
 }
 const inspect=()=>inspectAccessViews(document,[{module:'search',element:'Doc'}],[{sourceId:'uc-search-binding',document:binding}],'logical');
 return {document,binding,access,payload,inspect};
}

// @covers US-080-AC2 -- declaration checks do not establish native qualification.
test('original model and physical binding admit closed non-temporal raw ColumnSets',()=>{
 for(const platform of ['unity-catalog','spark-delta','lakebase']){const f=fixture(platform),before=JSON.stringify([f.document,f.binding]);expect(f.inspect().diagnostics).toEqual([]);expect(JSON.stringify([f.document,f.binding])).toBe(before);}
 expect(rawTableBindingProfiles.every(profile=>profile.nativeQualification==='UNTESTED')).toBe(true);
});

// @covers US-080-AC2
test('native column declarations refuse domain changes and ungoverned vector meanings',()=>{
 for(const [field,type] of [['count','INT'],['amount','DECIMAL(39,10)'],['amount','DECIMAL(38,9)'],['embedding','ARRAY<DOUBLE>'],['body','VARCHAR(100)']]){const f=fixture();f.access.columns[0].columns.find((column:any)=>column.field.element===field).type=type;expect(f.inspect().diagnostics.some(d=>d.accessCode==='ACCESS_NATIVE')).toBe(true);}
 const unbounded=fixture();delete unbounded.document.modules[0]!.elements.find(e=>e.id==='count')!.facets;expect(unbounded.inspect().diagnostics.some(d=>d.accessCode==='ACCESS_NATIVE')).toBe(true);
 const unsigned=fixture();(unsigned.document.modules[0]!.elements.find(e=>e.id==='count')!.facets as any).integerWidth.signed=false;expect(unsigned.inspect().diagnostics.some(d=>d.accessCode==='ACCESS_NATIVE')).toBe(true);
 const unindexed=fixture();unindexed.access.search=[];expect(unindexed.inspect().diagnostics.some(d=>d.accessCode==='ACCESS_NATIVE')).toBe(true);
 const collection=fixture(),body=collection.document.modules[0]!.elements.find(e=>e.id==='body')!;delete body.scalarType;body.cardinality='array';body.itemType={module:'search',element:'id'};expect(collection.inspect().diagnostics.some(d=>d.accessCode==='ACCESS_NATIVE')).toBe(true);
});

// @covers US-080-AC2
test('source binding and complete row policy remain independently mandatory',()=>{
 const missing=fixture();delete missing.payload.target.subset;expect(missing.inspect().diagnostics.some(d=>d.accessCode==='ACCESS_REFERENCE')).toBe(true);
 const nullable=fixture();nullable.access.columns[0].columns[0].notNull=false;expect(nullable.inspect().diagnostics.some(d=>d.accessCode==='ACCESS_CONFLICT')).toBe(true);
 const reordered=fixture();reordered.access.views[0].fields.unshift(reordered.access.views[0].fields.pop());expect(reordered.inspect().diagnostics.some(d=>d.accessCode==='ACCESS_COVERAGE')).toBe(true);
});

// @covers US-080-AC2 -- authored identities are retained, never inferred.
test('PostgreSQL-family native collation facts are explicit and nonmutating',()=>{
 const f=fixture('lakebase');
 for(const column of f.access.columns[0].columns)column.collation=['id','body'].includes(column.field.element)?{schema:'pg_catalog',name:'default'}:null;
 const before=JSON.stringify([f.document,f.binding]);
 expect(f.inspect().diagnostics).toEqual([]);
 expect(JSON.stringify([f.document,f.binding])).toBe(before);
 const named=fixture('lakebase');named.access.columns[0].columns[0].collation={schema:'application',name:'authored ordering'};
 expect(named.inspect().diagnostics).toEqual([]);
 // Declaration acceptance is not a native table observation or equivalence claim.
});

// @covers US-080-AC2
test('malformed or unknown selected collation facts refuse without substitution',()=>{
 for(const value of [undefined,'C',{}, {schema:'pg_catalog'}, {schema:'',name:'C'}, {schema:'pg_catalog',name:'a\0b'}, {schema:'pg_catalog',name:'é'.repeat(32)}]){
  const f=fixture('lakebase');f.access.columns[0].columns[0].collation=value;
  expect(f.inspect().diagnostics.some(d=>d.accessCode==='ACCESS_SHAPE')).toBe(true);
 }
 const unknown=fixture('lakebase');unknown.access.columns[0].columns[0].collation={schema:'pg_catalog',name:'C',meaning:'uninterpreted'};
 expect(unknown.inspect().diagnostics.some(d=>d.code==='UNKNOWN_RELEVANT'&&d.pointer.endsWith('/collation/meaning'))).toBe(true);
 const foreign=fixture();foreign.access.columns[0].columns[0].collation=null;
 expect(foreign.inspect().diagnostics.some(d=>d.accessCode==='ACCESS_NATIVE')).toBe(true);
});

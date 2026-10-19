// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import engine from '../../fixtures/access/commerce/engine-only.json';
import {inspectAccessViews} from '../../src/compilation/admission/access/index';
import type {Document} from '../../src/model/types';
const selected=[{module:'commerce',element:'Order'}];
function source(){return structuredClone(engine) as unknown as Document;}
// @covers US-080-AC2
 test('contextual coverage and conflict diagnostics retain pointers and sources',()=>{
 const document=source(),before=JSON.stringify(document);expect(inspectAccessViews(document,selected,[],'logical').diagnostics).toEqual([]);expect(JSON.stringify(document)).toBe(before);
 const module=document.modules[0]!,access=module.extensions!['umf.access'] as unknown as {views:{fields:unknown[]}[]};access.views[0]!.fields.pop();
 const r=inspectAccessViews(document,selected,[],'logical');expect(r.diagnostics.some(d=>d.code==='ACCESS'&&d.accessCode==='ACCESS_COVERAGE'&&d.sourceId==='logical'&&d.pointer.includes('/views/0/fields'))).toBe(true);
 });
// @covers US-080-AC2
 test('contextual validation checks every reachable item Field in declared order',()=>{
 const doc=source(),m=doc.modules[0]!;m.elements[1]!.cardinality='array';delete m.elements[1]!.scalarType;delete m.elements[1]!.facets;m.elements[1]!.itemType={module:'commerce',element:'item'};m.elements.push({id:'item',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});
 const r=inspectAccessViews(doc,selected,[],'logical');expect(r.diagnostics.some(d=>d.accessCode==='ACCESS_COVERAGE')).toBe(true);
 });
// @covers US-080-AC2
 test('temporal Key components refuse at original core admission before any access profile',()=>{
 const doc=source(),m=doc.modules[0]!;m.elements[0]!.scalarType='timestamp';
 const a=m.extensions!['umf.access'] as unknown as {views:{fields:Record<string,unknown>[]}[]};a.views[0]!.fields[0]!.temporal='instant';
 expect(inspectAccessViews(doc,selected,[],'logical').diagnostics.some(d=>d.accessCode==='ACCESS_SHAPE')).toBe(true);
 });
import relational from '../../fixtures/access/commerce/postgresql18.json';
import binding from '../../fixtures/access/commerce/postgresql18-binding.json';
// @covers US-080-AC2
 test('selected bound Record requires native column facts for every member',()=>{
 const document=structuredClone(relational) as unknown as Document;
 const supplied=[{sourceId:'orders-binding',document:structuredClone(binding) as unknown as Document}];
 expect(inspectAccessViews(document,selected,supplied,'logical').diagnostics).toEqual([]);
 const payload=document.modules[0]!.extensions!['umf.access'] as unknown as {columns:{columns:unknown[]}[]};payload.columns[0]!.columns.pop();
 expect(inspectAccessViews(document,selected,supplied,'logical').diagnostics.some(d=>d.accessCode==='ACCESS_COVERAGE')).toBe(true);
 });

import {expect,test} from 'bun:test';
import {prepareCoreInspection,inspectCoreKeys,inspectCoreFacets,inspectCoreSchemaProperties,readDocument,validateDocument} from '../../src/index';
import {request} from '../compilation/access-fixtures';
const fixture=()=>readDocument(request().sources[0]!.text,'json');
// @covers US-080-AC3 @covers US-080-AC4
test('prepared selectors exactly match ordinary core meanings for every fixture element',()=>{
 for(const version of ['0.8.0','0.9.0'] as const){
 const doc=fixture();doc.umf=version;const prepared=prepareCoreInspection(doc);
 for(const module of doc.modules)for(const element of module.elements){
  const identity={module:module.id,element:element.id};
  expect(prepared.keys(identity)).toEqual(inspectCoreKeys(doc,identity).meaning);
  expect(prepared.facets(identity)).toEqual(inspectCoreFacets(doc,identity).meaning);
  expect(prepared.schemaProperties(identity)).toEqual(inspectCoreSchemaProperties(doc,{scope:'element',...identity}).properties);
 }
 expect(prepared.source).toEqual(doc);expect(prepared.source).not.toBe(doc);expect(Object.isFrozen(prepared.source.modules[0]!.elements[0])).toBe(true);
 }
});
// @covers US-080-AC3
test('unknown Key qualifiers and facet assertions remain partial with exact retained paths',()=>{
 const doc=fixture(),record=doc.modules[0]!.elements.find(e=>e.id==='Order')!;
 (record.keys as any[])[0].future={retained:'opaque'};
 const field=doc.modules[0]!.elements[0]!;field.facets={length:{max:8,unit:'future-unit'},future:{nested:1}};
 doc.future={extension:{token:'unknown'}};
 expect(validateDocument(doc).valid).toBe(true);
 const prepared=prepareCoreInspection(doc),recordId={module:'commerce',element:'Order'},fieldId={module:'commerce',element:field.id};
 expect(prepared.keys(recordId)).toEqual(inspectCoreKeys(doc,recordId).meaning);expect(prepared.keys(recordId).state).toBe('partial');
 expect(prepared.facets(fieldId)).toEqual(inspectCoreFacets(doc,fieldId).meaning);expect(prepared.facets(fieldId).state).toBe('partial');
 expect(prepared.source.future).toEqual(doc.future);
 expect(prepared.schemaProperties(fieldId)).toEqual(inspectCoreSchemaProperties(doc,{scope:'element',...fieldId}).properties);
});
// @covers US-080-AC4
test('caller and result mutations cannot alter the owned snapshot or later meanings',()=>{
 const doc=fixture(),identity={module:'commerce',element:'Order'},prepared=prepareCoreInspection(doc),before=prepared.keys(identity);
 const result=prepared.keys(identity);if(result.state!=='known')throw Error('fixture expected known Key');result.keys[0]!.id='changed';
 (doc.modules[0]!.elements.find(e=>e.id==='Order')!.keys as any[])[0].name='Caller changed name';
 expect(prepared.keys(identity)).toEqual(before);expect(inspectCoreKeys(doc,identity).meaning).not.toEqual(before);
 expect(()=>{prepared.source.modules[0]!.elements[0]!.id='changed';}).toThrow();
 const another=prepareCoreInspection(doc);expect(another.source).not.toBe(prepared.source);
});
// @covers US-080-AC4
test('preparation and selectors refuse invalid sources and malformed or unresolved identities',()=>{
 const doc=fixture(),prepared=prepareCoreInspection(doc);
 for(const select of [prepared.keys,prepared.facets,prepared.schemaProperties]){
  expect(()=>select({module:'commerce',element:'missing'})).toThrow();
  expect(()=>select({module:'commerce',element:'Order',extra:true} as any)).toThrow();
  expect(()=>select({module:'',element:'Order'})).toThrow();
 }
 doc.modules[0]!.elements.push(doc.modules[0]!.elements[0]!);expect(()=>prepareCoreInspection(doc)).toThrow();
 const old=fixture();old.umf='0.7.0';expect(()=>prepareCoreInspection(old)).toThrow();
});

// @covers US-080-AC4
test('preparation retains JSON safety guards without executing caller accessors',()=>{
 let reads=0;const doc=fixture();Object.defineProperty(doc,'hostile',{enumerable:true,get(){reads++;throw Error('executed');}});
 expect(()=>prepareCoreInspection(doc)).toThrow();expect(reads).toBe(0);
 const cyclic=fixture();cyclic.future=cyclic;expect(()=>prepareCoreInspection(cyclic)).toThrow();
});

import {describe,test,expect} from 'bun:test';
import {schemaPropertiesFixture,schemaPropertiesCases} from '../../scripts/core-schema-properties-cases';
import {selectCoreElements,validateDocument,readDocument,writeDocument,declareCoreSchemaProperties,inspectCoreSchemaProperties,validateCoreFieldValue,resolveCoreDefault} from '../../src/index';
import {type Document} from '../../src/model/types';
const field=(element:string)=>({module:'m',element});
describe('CONTRACT-049 schema properties',()=>{
 for(const row of schemaPropertiesCases())test(row.id,()=>expect(validateDocument(row.document).valid).toBe(row.valid));
 test('public JSON/YAML round trips and input copy isolation',()=>{
  const doc=schemaPropertiesFixture(),before=JSON.stringify(doc);for(const format of ['json','yaml'] as const)expect(readDocument(writeDocument(doc,format),format)).toEqual(doc);
  const r=declareCoreSchemaProperties(doc,{scope:'element',...field('quantity')},{title:'Count',aliases:['count']});expect(JSON.stringify(doc)).toBe(before);expect(validateDocument(r).valid).toBe(true);expect(inspectCoreSchemaProperties(r,{scope:'element',...field('quantity')}).properties.title).toBe('Count');
 });
 test('document/module metadata do not change IDs',()=>{let doc=schemaPropertiesFixture();doc=declareCoreSchemaProperties(doc,{scope:'document'},{title:'New',aliases:['orders']});doc=declareCoreSchemaProperties(doc,{scope:'module',module:'m'},{title:'Module'});expect(doc.id).toBe('schema-properties');expect(doc.modules[0]!.id).toBe('m');expect(()=>declareCoreSchemaProperties(doc,{scope:'document'},{examples:[]})).toThrow();});
 test('value properties are refused on non-Field elements',()=>{const doc=schemaPropertiesFixture();doc.modules[0]!.elements.push({id:'other',kind:'future-kind',extensions:{}} as any);expect(validateDocument(doc).valid).toBe(true);expect(()=>declareCoreSchemaProperties(doc,{scope:'element',module:'m',element:'other'},{examples:[{string:'x'}]})).toThrow();expect(declareCoreSchemaProperties(doc,{scope:'element',module:'m',element:'other'},{title:'Other'}).modules[0]!.elements[6]!.title).toBe('Other');});
 test('defaults distinguish missing, null and present without mutation',()=>{
  const doc=schemaPropertiesFixture();expect(resolveCoreDefault(doc,field('quantity'),{state:'missing'}).applied).toBe(true);expect(()=>resolveCoreDefault(doc,field('quantity'),{state:'present',value:null})).toThrow();expect(resolveCoreDefault(doc,field('quantity'),{state:'present',value:{integerToken:'2'}}).applied).toBe(false);
  expect(resolveCoreDefault(doc,field('label'),{state:'missing'}).result).toEqual({state:'missing'});expect(resolveCoreDefault(doc,field('label'),{state:'present',value:null}).applied).toBe(true);expect(resolveCoreDefault(doc,field('price'),{state:'present',value:null}).applied).toBe(true);
  expect(validateDocument(doc).valid).toBe(true);expect(doc.modules[0]!.elements[0]!.default).toEqual({value:{integerToken:'1'},on:'missing'});
 });
 test('exact numeric values, range boundaries and Unicode units',()=>{
  const doc=schemaPropertiesFixture();expect(validateCoreFieldValue(doc,field('quantity'),{integerToken:'2e0'}).valid).toBe(true);expect(validateCoreFieldValue(doc,field('quantity'),{integerToken:'3'}).valid).toBe(false);
  expect(validateCoreFieldValue(doc,field('price'),{decimalToken:'999999999999999999.99'}).valid).toBe(true);expect(validateCoreFieldValue(doc,field('price'),{decimalToken:'0'}).valid).toBe(false);expect(validateCoreFieldValue(doc,field('label'),{string:'😀😀😀'}).valid).toBe(true);expect(validateCoreFieldValue(doc,field('byte'),{binaryHex:'FF'}).valid).toBe(true);
 });
 test('minimum-only length, zero-sized collections and maps',()=>{
  let doc=schemaPropertiesFixture();delete doc.modules[0]!.elements[2]!.default;(doc.modules[0]!.elements[2]!.facets as any).length={min:1,unit:'unicode-scalar'};expect(validateDocument(doc).valid).toBe(true);
  const vector=doc.modules[0]!.elements[5]!;delete vector.examples;vector.default={value:{map:{}},on:'missing'};vector.cardinality='map';vector.facets={collectionSize:{min:0,max:0}};expect(validateDocument(doc).valid).toBe(true);expect(validateCoreFieldValue(doc,field('vector'),{map:{x:{integerToken:'1'}}}).valid).toBe(false);
 });
 test('unknown unrelated content survives; relevant qualifiers refuse',()=>{
  const doc=schemaPropertiesFixture();doc.future={secret:'retain'};const f=doc.modules[0]!.elements[4]!;f.facets={future:'unknown'};expect(validateDocument(doc).valid).toBe(true);expect(validateCoreFieldValue(doc,field('vector-item'),{integerToken:'1'}).valid).toBe(false);
  const r=declareCoreSchemaProperties(doc,{scope:'document'},{title:'Changed'});expect(r.future).toEqual(doc.future);
  const label=doc.modules[0]!.elements[2]!;delete label.examples;delete label.default;(label.facets as any).length.future=true;expect(()=>declareCoreSchemaProperties(doc,{scope:'element',...field('label')},{facets:{length:{min:2,unit:'unicode-scalar'}}})).toThrow();
 });
 test('current-core metadata selection follows item types and retains new properties',()=>{const doc=schemaPropertiesFixture(),selection=selectCoreElements(doc,{references:'transitive',identities:[field('vector')],cardinalities:['array']});expect(selection.selection.map(e=>e.element.id)).toEqual(['vector-item','vector']);expect(selection.selection[1]!.element.default).toEqual(doc.modules[0]!.elements[5]!.default);});
 test('zero maximum lengths, absolute tokens and known default preservation',()=>{
  const doc=schemaPropertiesFixture(),label=doc.modules[0]!.elements[2]!;delete label.default;label.facets={length:{min:0,max:0,unit:'unicode-scalar'}};label.examples=[{string:''}];expect(validateDocument(doc).valid).toBe(true);expect(validateCoreFieldValue(doc,field('label'),{string:''}).valid).toBe(true);
  expect(validateCoreFieldValue(doc,field('quantity'),{integerToken:'1\n'}).valid).toBe(false);expect(validateCoreFieldValue(doc,field('byte'),{binaryHex:'ff\n'}).valid).toBe(false);
  const patched=declareCoreSchemaProperties(doc,{scope:'element',...field('quantity')},{facets:{range:{min:{integerToken:'1'},max:{integerToken:'2'}}}});expect((patched.modules[0]!.elements[0]!.facets as any).integerWidth.bits).toBe(64);expect(validateDocument(patched).valid).toBe(true);const bounds=declareCoreSchemaProperties(patched,{scope:'element',...field('quantity')},{facets:{range:{maxInclusive:true}}});expect(validateDocument(bounds).valid).toBe(true);
 });
 test('hostile accessors are never executed',()=>{let calls=0;const request={};Object.defineProperty(request,'title',{enumerable:true,get(){calls++;return 'bad';}});expect(()=>declareCoreSchemaProperties(schemaPropertiesFixture(),{scope:'document'},request)).toThrow();expect(calls).toBe(0);});
 test('retired core marker is rejected by current authoring and validation',()=>{const old={...schemaPropertiesFixture(),umf:'0.7.0'} as any;expect(validateDocument(old).valid).toBe(false);expect(()=>declareCoreSchemaProperties(old,{scope:'document'},{title:'New'})).toThrow();});
});

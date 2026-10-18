import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import {validateDocument} from '../../src/validation/document';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import schema from '../../spec/core/schema.json';
import {facetCases,facetNumericTokens} from '../../scripts/core-facet-cases';
const check=createValidator().compile(schema);
const document=(element:any)=>({umf:'0.10.0',id:'facet-test',vocabularies:{},modules:[{id:'m',namespace:'',elements:[element]}]});
test('current facet constraints check families, roles, shape, pairs and qualified unknowns',()=>{
 const cases=facetCases();expect(cases.length).toBe(111);
 for(const row of cases){
  const before=copyJson(row.element),source=document(row.element),result=validateDocument(source);
  expect(result.valid,row.id).toBe(row.valid);expect(result.complete,row.id).toBe(row.valid&&!row.warnings);
  expect(copyJson(row.element)).toEqual(before);
  for(const d of result.diagnostics)expect(d.path.startsWith('/modules/0/elements/0')).toBe(true);
  for(const format of ['json','yaml'] as const){const recovered=readJsonValue(writeJsonValue(source,format),format);expect(recovered).toEqual(source);expect(validateDocument(recovered as any).valid,row.id).toBe(row.valid);}
 }
});
test('current JSON Schema handles facet structure; compiled constraints compare related bounds',()=>{
 const element={id:'v',kind:'field',scalarType:'decimal',facets:{precision:2,scale:3},extensions:{}},source=document(element);
 expect(check(source)).toBe(true);expect(validateDocument(source).diagnostics.some(d=>d.code==='FACET_SCALE')).toBe(true);
 const retired={...source,umf:'0.5.0'} as any;expect(check(retired)).toBe(false);expect(validateDocument(retired).valid).toBe(false);
 const nested={...document({id:'list',kind:'field',cardinality:'array',itemType:{module:'m',element:'v'},extensions:{}}),modules:[{id:'m',namespace:'',elements:[{id:'list',kind:'field',cardinality:'array',itemType:{module:'m',element:'v'},extensions:{}},{...element,facets:{precision:38,scale:9}}]}]};
 expect(check(nested)).toBe(true);expect(validateDocument(nested).valid).toBe(true);
});
test('facet tokens are checked before conversion; unsafe numbers and accessors refuse atomically',()=>{
 for(const {token,accepted} of facetNumericTokens)for(const format of ['json','yaml'] as const){
  const text=`{"umf":"0.10.0","id":"facet-token","vocabularies":{},"modules":[{"id":"m","namespace":"","elements":[{"id":"v","kind":"field","scalarType":"string","extensions":{},"facets":{"length":{"max":${token},"unit":"unicode-scalar"}}}]}]}`;
  if(accepted)expect(validateDocument(readJsonValue(text,format) as any).valid).toBe(true);else expect(()=>readJsonValue(text,format)).toThrow();
 }
 for(const value of [NaN,Infinity,-0,Number.MAX_SAFE_INTEGER+1])expect(validateDocument(document({id:'v',kind:'field',scalarType:'integer',extensions:{},facets:{integerWidth:{bits:value,signed:true}}})).valid).toBe(false);
 let invoked=false;const hostile={id:'v',kind:'field',extensions:{},get facets(){invoked=true;return {};}};expect(validateDocument(document(hostile)).valid).toBe(false);expect(invoked).toBe(false);
 const result=validateDocument(document(facetCases().find(c=>c.id==='unknown-qualifiers')!.element));expect(result.diagnostics.some(d=>d.path==='/modules/0/elements/0/facets/a~1b~0c')).toBe(true);
});

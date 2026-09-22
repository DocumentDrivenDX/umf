import {test,expect} from 'bun:test';
import {validateFacetElement} from '../../src/validation/facets';
import {createValidator} from '../../src/validation/schema';
import {validateDocument} from '../../src/validation/document';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import schema from '../../spec/core/facet-document.schema.json';
import {facetCases,facetNumericTokens} from '../../scripts/core-facet-cases';
const check=createValidator().compile(schema);
test('candidate facet semantics check families, roles, shape, pairs and qualified unknowns',()=>{
 const cases=facetCases();expect(cases.length).toBe(99);
 for(const row of cases){
  const before=copyJson(row.element),result=validateFacetElement(row.element,'/modules/0/elements/0');
  expect(result.valid,row.id).toBe(row.valid);expect(result.complete,row.id).toBe(row.valid&&!row.warnings);
  expect(copyJson(row.element)).toEqual(before);
  for(const d of result.diagnostics)expect(d.path.startsWith('/modules/0/elements/0')).toBe(true);
  for(const format of ['json','yaml'] as const){const recovered=readJsonValue(writeJsonValue(row.element,format),format);expect(recovered).toEqual(before);expect(validateFacetElement(recovered).valid,row.id).toBe(row.valid);}
 }
});
test('candidate JSON Schema documents structural limits; semantic comparison remains explicit',()=>{
 const element={id:'v',kind:'field',scalarType:'decimal',facets:{precision:2,scale:3},extensions:{}};
 const document={umf:'0.5.0',id:'candidate',vocabularies:{},modules:[{id:'m',namespace:'',elements:[element]}]};
 expect(check(document)).toBe(true);expect(validateFacetElement(element).diagnostics.some(d=>d.code==='FACET_SCALE')).toBe(true);
 expect(check({...document,umf:'0.4.0'})).toBe(false);
 // Public validation includes the semantic cross-member comparison.
 expect(validateDocument(document).diagnostics.some(d=>d.code==='FACET_SCALE')).toBe(true);
 const legacy={...document,umf:'0.4.0',modules:[{id:'m',namespace:'',elements:[{id:'v',kind:'field',facets:{anything:[null,false]},extensions:{}}]}]};
 expect(validateDocument(legacy).valid).toBe(true);
 expect(validateDocument(legacy).diagnostics.some(d=>d.code==='UNKNOWN_CORE_FIELD'&&d.path.endsWith('/facets'))).toBe(true);
 const nested={...document,modules:[{id:'m',namespace:'',elements:[{id:'list',kind:'field',cardinality:'array',itemType:{module:'m',element:'v'},extensions:{}},{...element,facets:{precision:38,scale:9}}]}]};
 expect(check(nested)).toBe(true);expect(validateFacetElement(nested.modules[0]!.elements[1]).valid).toBe(true);
});
test('facet tokens are checked before conversion; unsafe numbers and accessors refuse atomically',()=>{
 for(const {token,accepted} of facetNumericTokens)for(const format of ['json','yaml'] as const){
  const text=`{"id":"v","kind":"field","scalarType":"string","extensions":{},"facets":{"length":{"max":${token},"unit":"unicode-scalar"}}}`;
  if(accepted)expect(validateFacetElement(readJsonValue(text,format)).valid).toBe(true);
  else expect(()=>readJsonValue(text,format)).toThrow();
 }
 for(const value of [NaN,Infinity,-0,Number.MAX_SAFE_INTEGER+1])expect(validateFacetElement({id:'v',kind:'field',scalarType:'integer',extensions:{},facets:{integerWidth:{bits:value,signed:true}}}).valid).toBe(false);
 let invoked=false;const hostile={id:'v',kind:'field',extensions:{},get facets(){invoked=true;return {};}};
 expect(validateFacetElement(hostile).valid).toBe(false);expect(invoked).toBe(false);
 const result=validateFacetElement(facetCases().find(c=>c.id==='unknown-qualifiers')!.element);
 expect(result.diagnostics.some(d=>d.path==='/facets/a~1b~0c')).toBe(true);
});

import {test,expect} from 'bun:test';
import {upgradeFacetEnvelope,rollbackFacetEnvelope,validateDocument,readDocument,writeDocument,readJsonValue,writeJsonValue,copyJson,selectCoreElements,verifyCoreElementSelection,type Document} from '../../src';
const model=(facets:unknown):Document=>({umf:'0.4.0',id:'bounds',vocabularies:{future:{version:'1.0.0'}},extensions:{future:{raw:'9007199254740993'}},modules:[{id:'m',namespace:'sales',elements:[{id:'v',kind:'field',scalarType:'integer',facets,extensions:{future:{native:{width:'unknown'}}}},{id:'list',kind:'field',cardinality:'array',itemType:{module:'m',element:'v',future:{meaning:'retain'}},facets,extensions:{}},{id:'record',kind:'record',facets,extensions:{}}]}]});
test('explicit facet migration archives every legacy collision and recovers it through both serializations',()=>{
 for(const value of [null,false,0,'',[],{},'future',{integerWidth:{bits:8,signed:true}},{precision:3,scale:4}]){
  const source=model(value),before=copyJson(source),receipt=upgradeFacetEnvelope(source);
  expect(copyJson(source)).toEqual(before);expect(receipt.target.umf).toBe('0.5.0');expect(receipt.residuals).toHaveLength(3);
  expect(receipt.residuals.map(r=>r.value)).toEqual([value,value,value]);expect(validateDocument(receipt.target).valid).toBe(true);
  for(const e of receipt.target.modules[0]!.elements)expect(Object.hasOwn(e,'facets')).toBe(false);
  for(const format of ['json','yaml'] as const){
   const saved=readJsonValue(writeJsonValue(receipt,format),format) as unknown as typeof receipt;
   expect(rollbackFacetEnvelope(saved,saved.target).target).toEqual(source);
   expect(readDocument(writeDocument(saved.target,format),format)).toEqual(receipt.target);
  }
 }
});
test('rollback restores the original without reinterpreting later bounds; forged receipts and wrong versions refuse',()=>{
 const source=model({unknown:true}),receipt=upgradeFacetEnvelope(source),current=structuredClone(receipt.target);
 current.modules[0]!.elements[0]!.facets={integerWidth:{bits:128,signed:false,future:{opaque:true}}};
 const result=rollbackFacetEnvelope(receipt,current);expect(result.target).toEqual(source);expect(result.source).toEqual(current);expect(Object.hasOwn(receipt.target.modules[0]!.elements[0]!,'facets')).toBe(false);
 for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(result,format),format) as unknown as typeof result;expect(saved.source).toEqual(current);expect(saved.target).toEqual(source);}
 const forged=structuredClone(receipt);forged.residuals=[];expect(()=>rollbackFacetEnvelope(forged,current)).toThrow('Receipt conflicts');
 expect(()=>rollbackFacetEnvelope(receipt,{...current,id:'wrong'})).toThrow();expect(()=>upgradeFacetEnvelope(current)).toThrow();
 for(const umf of ['0.1.0','0.2.0','0.3.0'] as const)expect(()=>upgradeFacetEnvelope({...source,umf})).toThrow();
 current.modules[0]!.elements[0]!.facets={integerWidth:{bits:0,signed:true}};expect(()=>rollbackFacetEnvelope(receipt,current)).toThrow();
});
test('0.5.0 document validation and selection preserve item facets, availability, unknowns and boundaries',()=>{
 const doc=upgradeFacetEnvelope(model(null)).target,item=doc.modules[0]!.elements[0]!;
 item.facets={integerWidth:{bits:64,signed:true,future:{rule:'uninterpreted'}}};item.nullability='absent-allowed';
 expect(validateDocument(doc).valid).toBe(true);expect(validateDocument(doc).diagnostics.some(d=>d.code==='UNKNOWN_FACET')).toBe(true);
 for(const references of ['none','transitive'] as const){
  const selection=selectCoreElements(doc,{references,identities:[{module:'m',element:'list'}],cardinalities:['array']});
  expect(selection.selection).toHaveLength(references==='none'?1:2);expect(selection.referenceScope).toBe('explicit-core-references-and-item-types');
  expect(selection.boundaryItemTypes).toHaveLength(references==='none'?1:0);
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(selection,format),format) as unknown as typeof selection;expect(verifyCoreElementSelection(saved)).toEqual(selection);}
 }
 const forged=selectCoreElements(doc,{references:'transitive',identities:[{module:'m',element:'list'}]});forged.selection[0]!.element.facets={integerWidth:{bits:8,signed:true}};expect(()=>verifyCoreElementSelection(forged)).toThrow();
 doc.modules[0]!.elements[1]!.itemType={module:'m',element:'missing'};expect(validateDocument(doc).diagnostics.some(d=>d.code==='UNRESOLVED_ITEM_TYPE')).toBe(true);
});

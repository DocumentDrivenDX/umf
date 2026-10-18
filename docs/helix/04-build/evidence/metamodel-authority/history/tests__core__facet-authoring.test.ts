import {test,expect} from 'bun:test';
import * as u from '../../src';
const identity={module:'m',element:'v'};
const doc=(family:string):u.Document=>({umf:'0.5.0',id:'facets',vocabularies:{future:{version:'1.0.0'}},extensions:{future:{opaque:'9007199254740993'}},modules:[{id:'m',namespace:'',elements:[{id:'v',kind:'field',scalarType:family,extensions:{future:{unknown:[null,'keep']}}}]}]});
test('authored facet groups have copied provenance, exact declared bounds and verifiable JSON/YAML receipts',()=>{
 const cases:[string,u.CoreFacetPatch][]=[['string',{length:{max:0,unit:'unicode-scalar'}}],['binary',{length:{max:16,unit:'byte'}}],['decimal',{precision:38,scale:9}],['integer',{integerWidth:{bits:128,signed:true}}],['integer',{integerWidth:{bits:1,signed:false}}],['decimal',{precision:Number.MAX_SAFE_INTEGER,scale:Number.MAX_SAFE_INTEGER}]];
 for(const [family,request] of cases){const source=doc(family),before=u.copyJson(source),result=u.declareCoreFacets(source,identity,request),meaning=u.inspectCoreFacets(result.target,identity).meaning;
  expect(u.copyJson(source)).toEqual(before);expect(result.provenance.origin).toBe('authored');expect(result.target.modules[0]!.elements[0]!.facets).toEqual(request);
  expect(u.copyJson(meaning)).toEqual(u.copyJson({state:'known',facets:request,interpreted:request,uninterpretedPaths:[]}));
  expect(result.target.extensions).toEqual(source.extensions);expect(result.target.modules[0]!.elements[0]!.extensions).toEqual(source.modules[0]!.elements[0]!.extensions);
  for(const format of ['json','yaml'] as const){const saved=u.readJsonValue(u.writeJsonValue(result,format),format) as unknown as typeof result;expect(u.verifyCoreFacetDeclaration(saved,saved.target)).toEqual(result);expect(u.readDocument(u.writeDocument(saved.target,format),format)).toEqual(result.target);}
 }
});
test('facet updates retain unknown groups and nested qualifiers; unknown units stay uninterpreted',()=>{
 const source=doc('integer');source.modules[0]!.elements[0]!.facets={integerWidth:{bits:8,signed:true,comparison:{native:'opaque'}},future:{token:'9007199254740993'}};
 const result=u.declareCoreFacets(source,identity,{integerWidth:{bits:16,signed:false}}),meaning=u.inspectCoreFacets(result.target,identity).meaning;
 expect(result.target.modules[0]!.elements[0]!.facets).toEqual({integerWidth:{bits:16,signed:false,comparison:{native:'opaque'}},future:{token:'9007199254740993'}});
 expect(meaning.state).toBe('partial');if(meaning.state!=='partial')throw Error('Expected partial');expect(meaning.interpreted).toEqual({integerWidth:{bits:16,signed:false}});expect(meaning.uninterpretedPaths).toEqual(['/modules/0/elements/0/facets/future','/modules/0/elements/0/facets/integerWidth/comparison']);
 const future=doc('string');future.modules[0]!.elements[0]!.facets={length:{max:8,unit:'future-unit'}};const inspection=u.inspectCoreFacets(future,identity);
 expect(inspection.meaning.state).toBe('partial');if(inspection.meaning.state!=='partial')throw Error('Expected partial');expect(inspection.meaning.interpreted).toEqual({});
 expect(()=>u.declareCoreFacets(future,identity,{length:{max:4,unit:'unicode-scalar'}})).toThrow('Unknown length unit');
});
test('invalid facet patches, conflicts, legacy authoring and hostile inputs refuse without mutation',()=>{
 const source=doc('decimal'),before=u.copyJson(source);
 for(const request of [{},{precision:2},{scale:1},{precision:1,scale:2},{precision:0,scale:0},{precision:3,scale:null},{length:{max:2,unit:'byte'}},{integerWidth:{bits:8,signed:true}},{precision:3,scale:1,future:true}])expect(()=>u.declareCoreFacets(source,identity,request as u.CoreFacetPatch)).toThrow();
 expect(u.copyJson(source)).toEqual(before);
 for(const umf of ['0.1.0','0.2.0','0.3.0','0.4.0'] as const){const legacy={...source,umf};legacy.modules=structuredClone(source.modules);legacy.modules[0]!.elements[0]!.facets={opaque:[false,null]};expect(u.inspectCoreFacets(legacy,identity).meaning).toEqual({state:'legacy',value:{opaque:[false,null]}});expect(()=>u.declareCoreFacets(legacy,identity,{precision:3,scale:1})).toThrow('migration');}
 expect(u.inspectCoreFacets(source,identity).meaning).toEqual({state:'missing'});
 const record=doc('integer');delete record.modules[0]!.elements[0]!.scalarType;record.modules[0]!.elements[0]!.kind='record';expect(u.inspectCoreFacets(record,identity).meaning).toEqual({state:'inapplicable'});
 expect(()=>u.declareCoreFacets(record,identity,{integerWidth:{bits:8,signed:true}})).toThrow('Field');
 let calls=0;const hostile={get precision(){calls++;return 3;},scale:1};expect(()=>u.declareCoreFacets(source,identity,hostile)).toThrow();expect(calls).toBe(0);
});
test('stale, forged and cross-document facet receipts cannot confer author provenance',()=>{
 const r=u.declareCoreFacets(doc('integer'),identity,{integerWidth:{bits:8,signed:true}});
 const forged=structuredClone(r);forged.request.integerWidth!.bits=16;expect(()=>u.verifyCoreFacetDeclaration(forged,r.target)).toThrow();
 const changed=structuredClone(r.target);changed.modules[0]!.elements[0]!.facets={integerWidth:{bits:16,signed:true}};expect(()=>u.verifyCoreFacetDeclaration(r,changed)).toThrow('changed');
 expect(()=>u.verifyCoreFacetDeclaration(r,{...r.target,id:'different'})).toThrow();
 const inspection=u.inspectCoreFacets(r.target,identity);if(inspection.meaning.state!=='known')throw Error('Expected known');inspection.meaning.facets.integerWidth!.bits=32;expect(r.target.modules[0]!.elements[0]!.facets).toEqual({integerWidth:{bits:8,signed:true}});
});

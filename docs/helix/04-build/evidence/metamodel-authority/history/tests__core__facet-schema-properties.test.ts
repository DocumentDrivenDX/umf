import {test,expect} from 'bun:test';
import {inspectCoreFacets,declareCoreFacets,historicalCoreFacetPatch,coreFacetOperationV4Schema} from '../../src/model/facets';
import {createValidator} from '../../src/validation/schema';
import properties from '../../spec/core/schema-properties-document.schema.json';
import type {Document} from '../../src/model/types';
const identity={module:'m',element:'v'};
const wrap=(field:Record<string,unknown>):Document=>({umf:'0.8.0',id:'original',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'v',kind:'field',extensions:{},...field},{id:'item',kind:'field',scalarType:'string',extensions:{}}]}]}) as Document;
test('original0.8 facet inspection covers exact new bounds and older groups without authoring',()=>{
 const rows=[
  {scalarType:'string',facets:{length:{min:2,unit:'unicode-scalar'}}},
  {scalarType:'binary',facets:{length:{min:0,max:8,unit:'byte'}}},
  {scalarType:'integer',facets:{integerWidth:{bits:128,signed:true},range:{min:{integerToken:'9007199254740993'},max:{integerToken:'9007199254740995'},minInclusive:false}}},
  {scalarType:'decimal',facets:{precision:38,scale:2,range:{min:{decimalToken:'-1.25'},max:{decimalToken:'2.50'},maxInclusive:false}}},
  {cardinality:'array',itemType:{module:'m',element:'item'},facets:{collectionSize:{min:0,max:3}}},
  {cardinality:'map',itemType:{module:'m',element:'item'},facets:{collectionSize:{min:2}}},
 ];
 const validator=createValidator();validator.addSchema(properties);const check=validator.compile(coreFacetOperationV4Schema);
 for(const row of rows){const source=wrap(row),before=structuredClone(source),r=inspectCoreFacets(source,identity);
  expect(r.version).toBe('4.0.0');expect(r.source).toEqual(source);expect<unknown>(r.meaning).toEqual({state:'known',facets:row.facets,interpreted:row.facets,uninterpretedPaths:[]});expect(check(r)).toBe(true);
  const forged={...r,meaning:{state:'legacy',value:row.facets}};expect(check(forged)).toBe(false);
  expect(()=>declareCoreFacets(source,identity,{integerWidth:{bits:8,signed:true}})).toThrow('migration');expect(source).toEqual(before);
 }
});
test('original0.8 facet unknown qualifiers and units stay scoped; interpretations are isolated',()=>{
 const source=wrap({scalarType:'integer',facets:{integerWidth:{bits:128,signed:true,future:false},range:{min:{integerToken:'9007199254740993'},future:{deny:true}},'future/~':null}});
 const r=inspectCoreFacets(source,identity);expect(r.meaning.state).toBe('partial');
 if(r.meaning.state!=='partial')throw Error('Expected partial');
 expect(r.meaning.interpreted).toEqual({integerWidth:{bits:128,signed:true},range:{min:{integerToken:'9007199254740993'}}});
 expect(new Set(r.meaning.uninterpretedPaths)).toEqual(new Set(['/modules/0/elements/0/facets/integerWidth/future','/modules/0/elements/0/facets/range/future','/modules/0/elements/0/facets/future~1~0']));
 r.meaning.interpreted.range!.min={integerToken:'1'};expect((r.meaning.facets.range as any).min).toEqual({integerToken:'9007199254740993'});expect(r.source).toEqual(source);
 const unknown=inspectCoreFacets(wrap({scalarType:'string',facets:{length:{min:1,unit:'future'}}}),identity);expect(unknown.meaning).toEqual({state:'partial',facets:{length:{min:1,unit:'future'}},interpreted:{},uninterpretedPaths:['/modules/0/elements/0/facets/length/unit']});
 expect(inspectCoreFacets(wrap({scalarType:'string'}),identity).meaning).toEqual({state:'missing'});expect(inspectCoreFacets(wrap({kind:'record',members:[]}),identity).meaning).toEqual({state:'inapplicable'});
 expect(()=>historicalCoreFacetPatch({length:{min:1,unit:'byte'}})).toThrow('cannot represent');expect(()=>historicalCoreFacetPatch({collectionSize:{max:2}})).toThrow('cannot represent');expect(()=>historicalCoreFacetPatch({range:{min:{integerToken:'1'}}})).toThrow('cannot represent');
});

test('historical projection bridge snapshots and validates its public input',()=>{
 let calls=0;expect(()=>historicalCoreFacetPatch({get collectionSize(){calls++;return undefined;}} as any)).toThrow();expect(calls).toBe(0);
 for(const bad of [{future:false},{scale:1},{length:{max:2,unit:'future'}},{integerWidth:{bits:8,signed:true,future:false}}])expect(()=>historicalCoreFacetPatch(bad as any)).toThrow('closed interpreted');
 expect(historicalCoreFacetPatch({})).toEqual({});expect(historicalCoreFacetPatch({length:{max:2,unit:'byte'},precision:3,scale:1})).toEqual({length:{max:2,unit:'byte'},precision:3,scale:1});
});

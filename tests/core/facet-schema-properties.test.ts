import {test,expect} from 'bun:test';
import {inspectCoreFacets,declareCoreFacets} from '../../src/model/facets';
import schema from '../../spec/core/facet-operation-v5.schema.json';
import {createValidator} from '../../src/validation/schema';
import core from '../../spec/core/schema.json';
import semanticTypeReference from '../../spec/core/semantic-type-reference.schema.json';
import type {Document} from '../../src/model/types';
const identity={module:'m',element:'v'};
const wrap=(field:Record<string,unknown>):Document=>({umf:'0.10.0',id:'original',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'v',kind:'field',extensions:{},...field},{id:'item',kind:'field',scalarType:'string',extensions:{}}]}]}) as unknown as Document;
test('current facet inspection covers exact new bounds and older groups without authoring',()=>{
 const rows=[
  {scalarType:'string',facets:{length:{min:2,unit:'unicode-scalar'}}},
  {scalarType:'binary',facets:{length:{min:0,max:8,unit:'byte'}}},
  {scalarType:'integer',facets:{integerWidth:{bits:128,signed:true},range:{min:{integerToken:'9007199254740993'},max:{integerToken:'9007199254740995'},minInclusive:false}}},
  {scalarType:'decimal',facets:{precision:38,scale:2,range:{min:{decimalToken:'-1.25'},max:{decimalToken:'2.50'},maxInclusive:false}}},
  {cardinality:'array',itemType:{module:'m',element:'item'},facets:{collectionSize:{min:0,max:3}}},
  {cardinality:'map',itemType:{module:'m',element:'item'},facets:{collectionSize:{min:2}}},
 ];
 const validator=createValidator();validator.addSchema(core);validator.addSchema(semanticTypeReference);const check=validator.compile(schema);
 for(const row of rows){const source=wrap(row),before=structuredClone(source),r=inspectCoreFacets(source,identity);
  expect(r.version).toBe('5.0.0');expect(r.source).toEqual(source);expect<unknown>(r.meaning).toEqual({state:'known',facets:row.facets,interpreted:row.facets,uninterpretedPaths:[]});expect(check(r)).toBe(true);
  const forged={...r,meaning:{state:'legacy',value:row.facets}};expect(check(forged)).toBe(false);
  expect(source).toEqual(before);
 }
});
test('current facet unknown qualifiers and units stay scoped; interpretations are isolated',()=>{
 const source=wrap({scalarType:'integer',facets:{integerWidth:{bits:128,signed:true,future:false},range:{min:{integerToken:'9007199254740993'},future:{deny:true}},'future/~':null}});
 const r=inspectCoreFacets(source,identity);expect(r.meaning.state).toBe('partial');
 if(r.meaning.state!=='partial')throw Error('Expected partial');
 expect(r.meaning.interpreted).toEqual({integerWidth:{bits:128,signed:true},range:{min:{integerToken:'9007199254740993'}}});
 expect(new Set(r.meaning.uninterpretedPaths)).toEqual(new Set(['/modules/0/elements/0/facets/integerWidth/future','/modules/0/elements/0/facets/range/future','/modules/0/elements/0/facets/future~1~0']));
 r.meaning.interpreted.range!.min={integerToken:'1'};expect((r.meaning.facets.range as any).min).toEqual({integerToken:'9007199254740993'});expect(r.source).toEqual(source);
 const unknown=inspectCoreFacets(wrap({scalarType:'string',facets:{length:{min:1,unit:'future'}}}),identity);expect(unknown.meaning).toEqual({state:'partial',facets:{length:{min:1,unit:'future'}},interpreted:{},uninterpretedPaths:['/modules/0/elements/0/facets/length/unit']});
 expect(inspectCoreFacets(wrap({scalarType:'string'}),identity).meaning).toEqual({state:'missing'});expect(inspectCoreFacets(wrap({kind:'record',members:[]}),identity).meaning).toEqual({state:'inapplicable'});
});

test('current facet authoring preserves compatible values and refuses invalid patches',()=>{
 const source=wrap({scalarType:'integer'});const receipt=declareCoreFacets(source,identity,{integerWidth:{bits:32,signed:true}});expect(receipt.target.modules[0]!.elements[0]!.facets).toEqual({integerWidth:{bits:32,signed:true}});expect(inspectCoreFacets(receipt.target,identity).meaning.state).toBe('known');expect(()=>declareCoreFacets(source,identity,{precision:4,scale:2})).toThrow();
});

import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import properties from '../../spec/core/schema.json';
import keys from '../../spec/core/schema.json';
import relationships from '../../spec/core/schema.json';
import keyResult from '../../spec/core/key-operation-v4.schema.json';
import relationshipResult from '../../spec/core/relationship-operation-v3.schema.json';
import {inspectCoreKeys} from '../../src/model/keys';
import {inspectCoreRelationships} from '../../src/model/relationships';
import type {Document} from '../../src/model/types';
test('current read-only Key and relationship result schemas preserve core meaning',()=>{
 const validator=createValidator();for(const schema of [properties,keys,relationships])validator.addSchema(schema);
 const source:Document={umf:'0.10.0',id:'d',vocabularies:{},extensions:{},modules:[{id:'m',namespace:'m',relationships:[],elements:[{id:'v',kind:'field',scalarType:'string',nullability:'required',cardinality:'one',extensions:{}},{id:'R',kind:'record',members:[{module:'m',element:'v'}],keys:[{id:'k',name:'key',fields:[{module:'m',element:'v'}],primary:true}],extensions:{}}]}]};
 for(const [schema,result] of [[keyResult,inspectCoreKeys(source,{module:'m',element:'R'})],[relationshipResult,inspectCoreRelationships(source,{module:'m'})]] as const){
  const check=validator.compile(schema);expect(check(result)).toBe(true);
  expect(check({...result,meaning:{state:'legacy',value:{arbitrary:true}}})).toBe(false);
 }
});

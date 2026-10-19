import {test,expect} from 'bun:test';
import {inspectCoreNullability,declareCoreNullability} from '../../src/model/nullability';
import type {Document} from '../../src/model/types';
const identity={module:'m',element:'v'};
const source=(kind:string,extra:Record<string,unknown>={}):Document=>({umf:'0.8.0',id:'source',vocabularies:{},extensions:{},modules:[{id:'m',namespace:'m',elements:[{id:'v',kind,extensions:{},...extra}]}]});
test('original0.8 nullability distinguishes declared, unknown, missing and inapplicable meanings',()=>{
 for(const value of ['required','absent-allowed','unspecified','future-availability'] as const){
  const document=source('field',{nullability:value}),result=inspectCoreNullability(document,identity);
  expect(result.version).toBe('6.0.0');expect(result.source).toEqual(document);
  expect(result.meaning).toEqual(value==='future-availability'?{state:'unknown',value}:{state:'known',nullability:value});
  expect(result.path).toBe('/modules/0/elements/0/nullability');
 }
 expect(inspectCoreNullability(source('field'),identity).meaning).toEqual({state:'missing'});
 expect(inspectCoreNullability(source('record'),identity).meaning).toEqual({state:'inapplicable'});
 expect(()=>declareCoreNullability(source('field'),identity,'required')).toThrow('Explicit envelope migration');
 const old={...source('field',{nullability:'required'}),umf:'0.7.0' as const};
 expect(inspectCoreNullability(old,identity).version).toBe('5.0.0');
});

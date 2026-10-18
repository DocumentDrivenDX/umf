import {test,expect} from 'bun:test';
import {inspectCoreNullability,declareCoreNullability} from '../../src/model/nullability';
import type {Document} from '../../src/model/types';
const identity={module:'m',element:'v'};
const source=(kind:string,extra:Record<string,unknown>={}):Document=>({umf:'0.10.0',id:'source',vocabularies:{},extensions:{},modules:[{id:'m',namespace:'m',elements:[{id:'v',kind,extensions:{},...extra}]}]});
test('current nullability distinguishes declared, unknown, missing and inapplicable meanings',()=>{
 for(const value of ['required','absent-allowed','unspecified','future-availability'] as const){
  const document=source('field',{nullability:value}),result=inspectCoreNullability(document,identity);
  expect(result.version).toBe('7.0.0');expect(result.source).toEqual(document);
  expect(result.meaning).toEqual(value==='future-availability'?{state:'unknown',value}:{state:'known',nullability:value});
  expect(result.path).toBe('/modules/0/elements/0/nullability');
 }
 expect(inspectCoreNullability(source('field'),identity).meaning).toEqual({state:'missing'});
 expect(inspectCoreNullability(source('record'),identity).meaning).toEqual({state:'inapplicable'});
 expect(declareCoreNullability(source('field'),identity,'required').target.modules[0]!.elements[0]!.nullability).toBe('required');
 const old={...source('field',{nullability:'required'}),umf:'0.7.0'} as any;
 expect(()=>inspectCoreNullability(old,identity)).toThrow();
});

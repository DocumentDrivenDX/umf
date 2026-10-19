// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {inspectCoreNullability,declareCoreNullability,verifyCoreNullabilityDeclaration} from '../../src/model/nullability';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {NULLABILITIES,type Document} from '../../src/model/types';
const identity={module:'m',element:'e'};
const model=(element:Record<string,unknown>={}):Document=>({umf:'0.10.0',id:'author',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[{id:'e',kind:'field',name:'value',extensions:{future:{nativeDefault:null,is_nullable:true}},...element}]},{id:'other',namespace:'support',elements:[{id:'e',kind:'field',name:'value',extensions:{}}]}]});
test('inspection distinguishes missing, inapplicable, known and unknown without inventing provenance',()=>{
 const source=model();expect(inspectCoreNullability(source,identity).meaning).toEqual({state:'missing'});
 source.modules[0]!.elements[0]!.nullability='future';expect(inspectCoreNullability(source,identity).meaning).toEqual({state:'unknown',value:'future'});
 for(const value of NULLABILITIES){source.modules[0]!.elements[0]!.nullability=value;expect(inspectCoreNullability(source,identity).meaning).toEqual({state:'known',nullability:value});}
 delete source.modules[0]!.elements[0]!.nullability;source.modules[0]!.elements[0]!.kind='group';expect(inspectCoreNullability(source,identity).meaning).toEqual({state:'inapplicable'});
});
test('authored availability has exact identity/provenance and survives JSON/YAML without native absence meaning',()=>{
 for(const value of NULLABILITIES){const source=model(),receipt=declareCoreNullability(source,identity,value);
  expect(receipt.provenance).toEqual({origin:'authored',idealPath:'/modules/0/elements/0/nullability',nullability:value,binding:{id:'umf.core.nullability.authoring',version:'5.0.0'},basis:'explicit-author-declaration',nativePath:null});
  expect(receipt.source).toEqual(source);expect(source.modules[0]!.elements[0]!.nullability).toBeUndefined();expect(receipt.target.modules[1]!.elements[0]!.nullability).toBeUndefined();expect(receipt.target.modules[0]!.elements[0]!.extensions).toEqual(source.modules[0]!.elements[0]!.extensions);
  for(const format of ['json','yaml'] as const){const restored=readJsonValue(writeJsonValue(copyJson(receipt),format),format) as unknown as typeof receipt;expect(verifyCoreNullabilityDeclaration(restored,restored.target)).toEqual(receipt);}
  receipt.target.modules[0]!.elements[0]!.extensions.future={changed:true};expect(receipt.source).toEqual(source);
 }
});
test('unknown assertions, non-fields, retired versions and invalid identities refuse instead of overwriting intent',()=>{
 const source=model();source.modules[0]!.elements[0]!.nullability='future';expect(()=>declareCoreNullability(source,identity,'required')).toThrow('Unknown');delete source.modules[0]!.elements[0]!.nullability;
 for(const kind of ['record','group',undefined] as const){if(kind)source.modules[0]!.elements[0]!.kind=kind;else delete source.modules[0]!.elements[0]!.kind;expect(()=>declareCoreNullability(source,identity,'required')).toThrow('Field');}
 for(const version of ['0.1.0','0.2.0','0.3.0','0.8.0','0.9.0'] as const){const legacy={...model(),umf:version} as any;expect(()=>inspectCoreNullability(legacy,identity)).toThrow();expect(()=>declareCoreNullability(legacy,identity,'required')).toThrow();}
 expect(()=>inspectCoreNullability(model(),{module:'missing',element:'e'})).toThrow();expect(()=>inspectCoreNullability(model(),{...identity,extra:true} as any)).toThrow();expect(()=>declareCoreNullability(model(),identity,'nullable' as any)).toThrow();
});
test('tampered and stale receipts refuse; core assertions never claim a native binding',()=>{
 for(const mutate of [(r:any)=>r.provenance.idealPath='/wrong',(r:any)=>r.target.modules[0].elements[0].nullability='unspecified',(r:any)=>r.source.future=true,(r:any)=>r.provenance.nativePath='/native']){const receipt=declareCoreNullability(model(),identity,'required');mutate(receipt);expect(()=>verifyCoreNullabilityDeclaration(receipt,receipt.target)).toThrow();}
 const receipt=declareCoreNullability(model(),identity,'required'),current=copyJson(receipt.target) as unknown as Document;current.modules[1]!.elements[0]!.description='unrelated edit';expect(()=>verifyCoreNullabilityDeclaration(receipt,current)).toThrow('changed');
});

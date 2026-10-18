import {test,expect} from 'bun:test';
import {inspectCoreNullability,declareCoreNullability,verifyCoreNullabilityDeclaration} from '../../src/model/nullability';
import {upgradeNullabilityEnvelope,rollbackNullabilityEnvelope} from '../../src/model/nullability-transition';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {NULLABILITIES,type Document} from '../../src/model/types';
const identity={module:'m',element:'e'};
const model=():Document=>({umf:'0.3.0',id:'author',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[{id:'e',kind:'field',name:'value',extensions:{future:{nativeDefault:null,is_nullable:true}}}]},{id:'other',namespace:'support',elements:[{id:'e',kind:'field',name:'value',extensions:{}}]}]});
test('inspection distinguishes legacy, absent, inapplicable, known and unknown without inventing provenance',()=>{
 const source=model();expect(inspectCoreNullability(source,identity).meaning).toEqual({state:'missing'});
 for(const umf of ['0.1.0','0.2.0'] as const){source.umf=umf;source.modules[0]!.elements[0]!.nullability={native:false};const result=inspectCoreNullability(source,identity);expect(result.meaning).toEqual({state:'legacy',value:{native:false}});expect(result.provenance).toBe('unverified');}
 source.umf='0.3.0';source.modules[0]!.elements[0]!.nullability='future';expect(inspectCoreNullability(source,identity).meaning).toEqual({state:'unknown',value:'future'});
 for(const value of NULLABILITIES){source.modules[0]!.elements[0]!.nullability=value;expect(inspectCoreNullability(source,identity).meaning).toEqual({state:'known',nullability:value});}
 delete source.modules[0]!.elements[0]!.nullability;source.modules[0]!.elements[0]!.kind='group';expect(inspectCoreNullability(source,identity).meaning).toEqual({state:'inapplicable'});
});
test('authored availability has exact identity/provenance and survives JSON/YAML without claiming native absence meaning',()=>{
 for(const value of NULLABILITIES){const source=model(),receipt=declareCoreNullability(source,identity,value);
  expect(receipt.provenance).toEqual({origin:'authored',idealPath:'/modules/0/elements/0/nullability',nullability:value,binding:{id:'umf.core.nullability.authoring',version:'1.0.0'},basis:'explicit-author-declaration',nativePath:null});
  expect(receipt.source).toEqual(source);expect(source.modules[0]!.elements[0]!.nullability).toBeUndefined();expect(receipt.target.modules[1]!.elements[0]!.nullability).toBeUndefined();expect(receipt.target.modules[0]!.elements[0]!.extensions).toEqual(source.modules[0]!.elements[0]!.extensions);
  for(const format of ['json','yaml'] as const){const restored=readJsonValue(writeJsonValue(copyJson(receipt),format),format) as unknown as typeof receipt;expect(verifyCoreNullabilityDeclaration(restored,restored.target)).toEqual(receipt);}
  receipt.target.modules[0]!.elements[0]!.extensions.future={changed:true};expect(receipt.source).toEqual(source);
 }
});
test('unknown assertions, non-fields, wrong versions and invalid identities refuse instead of overwriting intent',()=>{
 const source=model();source.modules[0]!.elements[0]!.nullability='future';expect(()=>declareCoreNullability(source,identity,'required')).toThrow('Unknown');delete source.modules[0]!.elements[0]!.nullability;
 for(const kind of ['record','group',undefined]){source.modules[0]!.elements[0]!.kind=kind;if(kind===undefined)delete source.modules[0]!.elements[0]!.kind;expect(()=>declareCoreNullability(source,identity,'required')).toThrow('Field');}
 source.modules[0]!.elements[0]!.kind='field';source.umf='0.2.0';expect(()=>declareCoreNullability(source,identity,'required')).toThrow('migration');
 expect(()=>inspectCoreNullability(model(),{module:'missing',element:'e'})).toThrow();expect(()=>inspectCoreNullability(model(),{...identity,extra:true} as any)).toThrow();expect(()=>declareCoreNullability(model(),identity,'nullable' as any)).toThrow();
});
test('tampered and stale receipts refuse; migration rollback retains new authored assertions',()=>{
 for(const mutate of [(r:any)=>r.provenance.idealPath='/wrong',(r:any)=>r.target.modules[0].elements[0].nullability='unspecified',(r:any)=>r.source.future=true,(r:any)=>r.provenance.nativePath='/native']){
  const receipt=declareCoreNullability(model(),identity,'required');mutate(receipt);expect(()=>verifyCoreNullabilityDeclaration(receipt,receipt.target)).toThrow();
 }
 const original=model();original.umf='0.2.0';original.modules[0]!.elements[0]!.nullability={opaque:true};const transition=upgradeNullabilityEnvelope(original),receipt=declareCoreNullability(transition.target,identity,'required');
 const current=copyJson(receipt.target) as unknown as Document;current.modules[1]!.elements[0]!.description='unrelated edit';expect(()=>verifyCoreNullabilityDeclaration(receipt,current)).toThrow('changed');
 const rollback=rollbackNullabilityEnvelope(transition,receipt.target);expect(rollback.target).toEqual(original);expect(rollback.source).toEqual(receipt.target);
});

import {test,expect} from 'bun:test';
import {inspectCoreElementKind,declareCoreElementKind,verifyCoreKindDeclaration} from '../../src/model/field-kind';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {type Document} from '../../src/model/types';
const identity={module:'m',element:'e'};
const doc=(extra:Record<string,unknown>={}):Document=>({umf:'0.10.0',id:'kinds',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[{id:'e',extensions:{future:{native:['retained',null]}},...extra},{id:'other',extensions:{}}]},{id:'other',namespace:'support',elements:[{id:'e',extensions:{}}]}]});
test('current kind inspection keeps known, missing and unknown roles distinct',()=>{
 for(const kind of ['field','record','group','future'] as const){const source=doc({kind}),result=inspectCoreElementKind(source,identity);expect(result.version).toBe('8.0.0');expect(result.source).toEqual(source);expect(result.meaning).toEqual((['field','record','group'].includes(kind)?{state:'known',kind}:{state:'unknown',value:kind}) as any);}
 expect(inspectCoreElementKind(doc(),identity).meaning).toEqual({state:'unspecified'});
 expect(declareCoreElementKind(doc(),identity,'field').target.umf).toBe('0.10.0');
});
test('kind lookup preserves exact source and rejects retired core markers',()=>{
 const source=doc({kind:'field'}),result=inspectCoreElementKind(source,identity);expect(result.provenance).toBe('unverified');expect(result.path).toBe('/modules/0/elements/0/kind');
 for(const format of ['json','yaml'] as const)expect(readJsonValue(writeJsonValue(copyJson(result),format),format)).toEqual(copyJson(result));
 for(const umf of ['0.1.0','0.2.0','0.3.0','0.8.0','0.9.0'] as const){const legacy={...doc(),umf} as any;expect(()=>inspectCoreElementKind(legacy,identity)).toThrow();expect(()=>declareCoreElementKind(legacy,identity,'field')).toThrow();}
 for(const kind of [null,42,{},[]])expect(()=>inspectCoreElementKind(doc({kind}),identity)).toThrow();
});
test('author provenance survives serialization and verification without claiming native meaning',()=>{
 for(const kind of ['field','record','group'] as const){
  const original=doc(),authored=declareCoreElementKind(original,identity,kind);expect(authored.source).toEqual(original);expect(authored.provenance.origin).toBe('authored');expect(authored.provenance.nativePath).toBe(null);
  for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(authored),format),format) as unknown as typeof authored;expect(verifyCoreKindDeclaration(receipt,receipt.target)).toEqual(authored);}
 }
});
test('authoring rejects unknown meaning, malformed identities and unsafe accessors atomically',()=>{
 const source=doc({kind:'future'}),before=copyJson(source);expect(()=>declareCoreElementKind(source,identity,'record')).toThrow();expect(copyJson(source)).toEqual(before);
 expect(()=>inspectCoreElementKind(doc(),{module:'absent',element:'e'})).toThrow();expect(()=>inspectCoreElementKind(doc(),{...identity,extra:true} as any)).toThrow();expect(()=>declareCoreElementKind(doc(),identity,'future' as any)).toThrow();
 let calls=0;const unsafe=doc();Object.defineProperty(unsafe.modules[0]!.elements[0]!, 'kind',{enumerable:true,get(){calls++;return 'field';}});expect(()=>inspectCoreElementKind(unsafe,identity)).toThrow();expect(calls).toBe(0);
});
test('provenance verification rejects forged paths, altered assertions and stale content',()=>{
 for(const change of [(r:any)=>r.provenance.idealPath='/modules/1/elements/0/kind',(r:any)=>r.target.modules[0].elements[0].kind='record',(r:any)=>r.provenance.origin='classified']){const receipt=declareCoreElementKind(doc(),identity,'field');change(receipt);expect(()=>verifyCoreKindDeclaration(receipt,receipt.target)).toThrow();}
 const receipt=declareCoreElementKind(doc(),identity,'field');for(const change of [(d:Document)=>d.modules[0]!.elements[0]!.extensions.future={changed:true},(d:Document)=>d.modules[1]!.namespace='changed']){const current=copyJson(receipt.target) as unknown as Document;change(current);expect(()=>verifyCoreKindDeclaration(receipt,current)).toThrow();}
 const verified=verifyCoreKindDeclaration(receipt,receipt.target);verified.target.id='copy';expect(receipt.target.id).toBe('kinds');
});

import {test,expect} from 'bun:test';
import {inspectCoreElementKind,declareCoreElementKind,verifyCoreKindDeclaration} from '../../src/model/field-kind';
import {upgradeFieldEnvelope,rollbackFieldEnvelope} from '../../src/model/field-transition';
import {copyJson} from '../../src/model/json';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {type Document} from '../../src/model/types';
const identity={module:'m',element:'e'};
const doc=(umf:Document['umf'],extra:Record<string,unknown>={}):Document=>({umf,id:'kinds',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'sales',elements:[{id:'e',extensions:{future:{native:['retained',null]}},...extra}]},{id:'other',namespace:'support',elements:[{id:'e',extensions:{}}]}]});
test('kind lookup separates legacy, unknown, missing and defined roles without inventing provenance',()=>{
 for(const umf of ['0.1.0','0.2.0'] as const)for(const kind of ['field','record','group','future',undefined] as const){
  const source=doc(umf,kind===undefined?{scalarType:'string'}:{kind});const result=inspectCoreElementKind(source,identity);
  expect(result.provenance).toBe('unverified');expect(result.source).toEqual(source);expect(result.path).toBe('/modules/0/elements/0/kind');
  expect(result.meaning).toEqual(kind===undefined?{state:'unspecified'}:umf==='0.1.0'?{state:'legacy',value:kind}:kind==='future'?{state:'unknown',value:kind}:{state:'known',kind});
  expect(inspectCoreElementKind(source,{module:'other',element:'e'}).meaning.state).toBe('unspecified');
  for(const format of ['json','yaml'] as const)expect(readJsonValue(writeJsonValue(copyJson(result),format),format)).toEqual(copyJson(result));
 }
 for(const kind of [null,42,{},[]])expect(inspectCoreElementKind(doc('0.1.0',{kind}),identity).meaning).toEqual({state:'legacy',value:kind});
});
test('author provenance survives serialization, verification and rollback without claiming native meaning',()=>{
 const original=doc('0.1.0',{kind:{unknown:'native'}}),migration=upgradeFieldEnvelope(original);
 for(const kind of ['field','record','group'] as const){
  const authored=declareCoreElementKind(migration.target,identity,kind);
  expect(authored.source).toEqual(migration.target);expect(Object.hasOwn(migration.target.modules[0]!.elements[0]!,'kind')).toBe(false);
  expect(authored.provenance.origin).toBe('authored');expect(authored.provenance.nativePath).toBe(null);
  for(const format of ['json','yaml'] as const){
   const receipt=readJsonValue(writeJsonValue(copyJson(authored),format),format) as unknown as typeof authored;
   expect(verifyCoreKindDeclaration(receipt,receipt.target)).toEqual(authored);
   const rollback=rollbackFieldEnvelope(migration,receipt.target);expect(rollback.target).toEqual(original);expect(rollback.source).toEqual(receipt.target);
  }
 }
});
test('authoring blocks unknown meaning, legacy versions and structured/scalar conflicts atomically',()=>{
 for(const source of [doc('0.1.0'),doc('0.2.0',{kind:'future'}),doc('0.2.0',{scalarType:'string'})]){
  const before=copyJson(source);expect(()=>declareCoreElementKind(source,identity,'record')).toThrow();expect(copyJson(source)).toEqual(before);
 }
 const source=doc('0.2.0');expect(()=>inspectCoreElementKind(source,{module:'absent',element:'e'})).toThrow();
 expect(()=>inspectCoreElementKind(source,{...identity,extra:true} as any)).toThrow();
 expect(()=>declareCoreElementKind(source,identity,'future' as any)).toThrow();
 let calls=0;Object.defineProperty(source.modules[0]!.elements[0]!,'kind',{enumerable:true,get(){calls++;return 'field';}});
 expect(()=>inspectCoreElementKind(source,identity)).toThrow();expect(calls).toBe(0);
});
test('provenance verification rejects forged paths, altered assertions and stale native or unrelated content',()=>{
 for(const change of [(r:any)=>r.provenance.idealPath='/modules/1/elements/0/kind',(r:any)=>r.target.modules[0].elements[0].kind='record',(r:any)=>r.provenance.origin='classified']){
  const receipt=declareCoreElementKind(doc('0.2.0'),identity,'field');change(receipt);expect(()=>verifyCoreKindDeclaration(receipt,receipt.target)).toThrow();
 }
 const receipt=declareCoreElementKind(doc('0.2.0'),identity,'field');
 for(const change of [(d:Document)=>d.modules[0]!.elements[0]!.extensions.future={changed:true},(d:Document)=>d.modules[1]!.namespace='changed']){
  const current=copyJson(receipt.target) as unknown as Document;change(current);expect(()=>verifyCoreKindDeclaration(receipt,current)).toThrow();
 }
 const verified=verifyCoreKindDeclaration(receipt,receipt.target);verified.target.id='copy';expect(receipt.target.id).toBe('kinds');
});

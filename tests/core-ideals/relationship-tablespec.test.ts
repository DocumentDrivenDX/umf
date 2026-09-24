import {describe,test,expect} from 'bun:test';
import {classifyTableSpecRelationships,verifyTableSpecRelationshipClassification,recoverTableSpecRelationshipSource,tableSpecRelationshipsPackage,TABLESPEC_RELATIONSHIPS_EXTENSION} from '../../src/core-ideals/relationship-tablespec';
import {importTableSpec,importTableSpecBundle} from '../../src/adapters/tablespec';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {validateDocument} from '../../src/validation/document';
import {Registry} from '../../src/registry/registry';
import type {Document} from '../../src/model/types';
import {relationshipCandidate} from '../../scripts/core-relationship-cases';
import proof from '../../fixtures/validation/relationship-tablespec-discovery-native.json';
const request={mode:'report',profile:'declared-metadata'} as const;
const imported=()=>importTableSpec(JSON.stringify(proof.cases[3]!.source),{id:'native',format:'json'});
describe('TableSpec relationship classification',()=>{
 // @covers US-045-AC3
 // @covers US-045-AC4
 // @covers US-045-AC5
 // @covers US-045-AC7
 for(const row of proof.cases)test(row.case+' reports native observations and preserves source',()=>{
  const text=JSON.stringify(row.source),doc=importTableSpec(text,{id:row.case,format:'json'}),before=structuredClone(doc);
  const r=classifyTableSpecRelationships(doc,request);expect(doc).toEqual(before);expect(r.status).toBe('classified');expect(r.target!.modules).toEqual(doc.modules);
  expect(validateDocument(r.target!,new Registry().register(tableSpecRelationshipsPackage)).valid).toBe(true);
  expect(r.observations.every(o=>o.authorIntent==='unknown'&&o.enforcement==='unknown')).toBe(true);
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverTableSpecRelationshipSource(saved,saved.target!)).toBe(text);}
  const strict=classifyTableSpecRelationships(doc,{...request,mode:'strict'});expect(strict.status).toBe(r.residuals.length?'blocked':'classified');if(strict.status==='blocked')expect(strict.target).toBeUndefined();
  const fake=structuredClone(r);fake.outcome=fake.outcome==='exact'?'unknown':'exact';expect(()=>verifyTableSpecRelationshipClassification(fake,r.target!)).toThrow();
  const stale=structuredClone(r.target!);stale.id+='changed';expect(()=>verifyTableSpecRelationshipClassification(r,stale)).toThrow();
 });
 test('resolves only local native source columns and retains all endpoint refinements',()=>{
  const r=classifyTableSpecRelationships(imported(),request),o=r.observations[0]!;
  expect(o.resolvedSource).toEqual({module:'table',element:'column:1'});expect(o.targetTable).toBe('customers');expect(o.targetColumn).toBe('id');expect(o.state).toBe('declared');
  expect(r.outcome).toBe('unknown');expect(o.native.kind).toBe('object');
 });
 test('malformed carrier and entry shapes have source-qualified residuals',()=>{
  for(const relationships of [7,{foreign_keys:{}},{outgoing:[null]},{'x/y~z':{future:1}}]){
   const doc=importTableSpec(JSON.stringify({...proof.cases[0]!.source,relationships}),{id:'bad',format:'json'}),r=classifyTableSpecRelationships(doc,request);
   expect(r.residuals.length).toBeGreaterThan(0);expect(r.observations.length).toBeGreaterThan(0);
   if(Object.hasOwn(Object(relationships),'x/y~z'))expect(r.observations[0]!.nativePath).toEndWith('/x~1y~0z');
  }
 });
 test('preserves authored 0.7 relationships without replacing their intent',()=>{
  const source=imported();source.umf='0.7.0';const ideal=relationshipCandidate();source.modules.push(...ideal.modules);
  const r=classifyTableSpecRelationships(source,request);expect(r.target!.modules).toEqual(source.modules);expect(r.target!.umf).toBe('0.7.0');
  expect(verifyTableSpecRelationshipClassification(r,r.target!)).toEqual(r);
 });
 test('split bundles and unknown exact-number metadata survive classification',()=>{
  const files={'table.yaml':'version: "1.0"\ntable_name: orders\nrelationships: {future: {n: 9007199254740993, decimal: 1.2300}}\n','columns/id.yaml':'column: {name: id, data_type: INTEGER}\n','notes.txt':'untouched\n'};
  const r=classifyTableSpecRelationships(importTableSpecBundle(files,{id:'split'}),request);
  for(const format of ['json','yaml'] as const){const saved=readJsonValue(writeJsonValue(r,format),format) as unknown as typeof r;expect(recoverTableSpecRelationshipSource(saved,saved.target!)).toEqual(files);}
 });
 test('conflicting payloads and versions block; unsafe accessors never execute',()=>{
  const r=classifyTableSpecRelationships(imported(),request);expect(classifyTableSpecRelationships(r.target!,request).status).toBe('blocked');
  const old=imported();old.vocabularies[TABLESPEC_RELATIONSHIPS_EXTENSION]={version:'2.0.0'};expect(classifyTableSpecRelationships(old,request).status).toBe('blocked');
  let reads=0;expect(()=>classifyTableSpecRelationships(imported(),{...request,get mode(){reads++;return 'report' as const;}})).toThrow();expect(reads).toBe(0);
  expect(()=>classifyTableSpecRelationships({get umf(){reads++;return '0.7.0';}} as Document,request)).toThrow();expect(reads).toBe(0);
 });
});

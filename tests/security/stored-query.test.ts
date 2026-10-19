// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {inspectCandidateStoredQueryProperties} from '../../src/extensions/security/stored-query-candidate';
import {runStoredQueryCorpus,storedQueryFixture} from './stored-query-corpus';
test('stored Field source resolution preserves original sources and conditional properties',()=>{
 for(const row of runStoredQueryCorpus()){expect(Boolean(row.passed),row.id).toBe(true);if(row.result.status==='refused'){expect(row.result.selection).toBe(null);expect(row.result.report).toBe(null);}}
 const row=runStoredQueryCorpus().find(r=>r.id==='implied-unauthored-equality')!;expect(row.result.report.authoredProperties).toEqual([]);expect(row.result.report.impliedProperties).toEqual(['equality']);
});
test('source snapshots resist mutation and getters refuse without execution',()=>{
 const f=storedQueryFixture(),program=compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology),use={type:f.owner.storage.at(-1).type,field:f.owner.storage.at(-1).field,operator:'join',required:['equality']};
 const r=inspectCandidateStoredQueryProperties(program,f.owner,use);expect(r.status).toBe('selected');expect(Object.isFrozen(r)).toBe(true);expect(Object.isFrozen(r.owner)).toBe(true);f.owner.storage.length=0;f.catalog.transforms.length=0;use.required[0]='order';expect((r.owner as any).storage.length).toBeGreaterThan(0);expect((r.use as any).required).toEqual(['equality']);
 let calls=0;const owner:any={};Object.defineProperty(owner,'storage',{enumerable:true,get(){calls++;return [];}});expect(inspectCandidateStoredQueryProperties(program,owner,use).status).toBe('refused');expect(calls).toBe(0);
});

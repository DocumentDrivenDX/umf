// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import source from './current-query-source.json';
import scenarios from './current-query-read-scenarios.json';
import {compileCandidateCatalogProgram} from '../../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogAction} from '../../../src/extensions/security/catalog-runtime-candidate';
const run=(policy:any,cut:any,request:any)=>evaluateCandidateCatalogAction(compileCandidateCatalogProgram(policy,source.catalog,source.closure,source.ontology),source.owner,cut,request);
test('query source/property compatibility never grants an undisclosed protected token read',async()=>{
 const raw=await Bun.file(new URL('./current-query-source.json',import.meta.url)).text();expect(createHash('sha256').update(raw).digest('hex')).toBe(scenarios.baseFixtureSha256);
 const cut=structuredClone(scenarios.cut);cut.policy.revision=source.policy.revision;
 const r=run(source.policy,cut,scenarios.request);expect(r.status).toBe('evaluated');expect(r.rows).toEqual([{decision:'indeterminate',dispositions:[]}]);expect([r.complete,r.authority]).toEqual([false,false]);
});
test('separately authored token-original policy preserves Staff/project membership and complete-fact refusal',()=>{
 const r=run(scenarios.policy,scenarios.cut,scenarios.request);expect(r.status).toBe('evaluated');expect(r.rows).toEqual([{decision:'permit',dispositions:[{field:{documentId:'domain',moduleId:'m',elementId:'token'},disposition:{kind:'original'}}]}]);expect([r.complete,r.authority]).toEqual([false,false]);
 const inactive=structuredClone(scenarios.cut);(inactive.facts.find(f=>f.type.elementId==='Assignment')!.fields.find(f=>f.field.elementId==='active')!.value as any).boolean=false;expect(run(scenarios.policy,inactive,scenarios.request).rows[0]?.decision).toBe('deny');
 const wrongProject=structuredClone(scenarios.cut);(wrongProject.facts.find(f=>f.type.elementId==='Assignment')!.fields.find(f=>f.field.elementId==='assignmentProject')!.value as any).string='p2';const other=structuredClone(wrongProject.facts.find(f=>f.type.elementId==='Project')!);(other.key[0] as any).string='p2';(other.fields[0]!.value as any).string='p2';wrongProject.facts.push(other);expect(run(scenarios.policy,wrongProject,scenarios.request).rows[0]?.decision).toBe('deny');
 const missing=structuredClone(scenarios.cut);missing.coverage.find(f=>f.type.elementId==='Assignment')!.fields=[];expect(run(scenarios.policy,missing,scenarios.request).status).toBe('refused');
 const stale=structuredClone(scenarios.cut);stale.policy.revision=source.policy.revision;expect(run(scenarios.policy,stale,scenarios.request).status).toBe('refused');
});

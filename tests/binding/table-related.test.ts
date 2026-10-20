// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {inspectTableLifecycle} from '../../src/extensions/tables';
import {compileTableDeployment,verifyTableDeployment} from '../../src/table-deployment';
import {generatePythonClient} from '../../src/access';
import {relatedSource} from '../unified/table-related-fixture';
const configuration={module:'demo',schema:'related_schema',ownerRole:'related_owner',personRole:'related_person',batchRole:'related_batch',groupRoles:{}};
const payload=(source:any)=>source.modules[0].extensions['umf.tables'];
test('typed related policies preserve association meaning without inventing integrity constraints',()=>{
 const source=relatedSource(),inspection=inspectTableLifecycle(source);expect(inspection.diagnostics).toEqual([]);
 const result=compileTableDeployment({text:JSON.stringify(source),configuration});if(result.status!=='compiled')throw Error(JSON.stringify(result));
 expect(verifyTableDeployment(result.bundle)).toEqual(result.bundle);
 expect(result.bundle.expectedCatalog.foreignKeys).toEqual([]);
 const sql=result.bundle.steps.find(s=>s.sourcePath.endsWith('/tables/0/policy/person/select'))!.sql;
 expect(sql).toContain('EXISTS (SELECT 1 FROM "related_schema"."memberships" AS "umf_j_0"');
 expect(sql).toContain('"related_schema"."notes"."id" = "umf_j_0"."note_id"');
 expect(sql).toContain('"umf_j_0"."person" COLLATE pg_catalog."C" = CURRENT_USER');
 expect(generatePythonClient({text:JSON.stringify(source),package:'related_demo'}).description.nativeExecutionQualified).toBe(false);
 expect(JSON.parse(result.bundle.source.utf8)).toEqual(source);
});
test('related policy source/target carriers, mapping, module, native SELECT and cycles are explicit',()=>{
 const changes=[
  (s:any)=>payload(s).tables[0].policy.person.select.record.module='foreign',
  (s:any)=>payload(s).tables[0].policy.person.select.matches[0].source={module:'demo',element:'memberPerson'},
  (s:any)=>payload(s).tables[0].policy.person.select.matches[0].target={module:'demo',element:'owner'},
  (s:any)=>payload(s).tables[0].policy.person.select.matches.push(structuredClone(payload(s).tables[0].policy.person.select.matches[0])),
  (s:any)=>Object.assign(s.modules[0].elements.find((e:any)=>e.id==='memberNote'),{scalarType:'integer'}),
  (s:any)=>payload(s).tables[1].policy.person.select={kind:'deny'},
  (s:any)=>payload(s).tables[1].policy.person.select={kind:'related',record:{module:'demo',element:'Note'},matches:[{source:{module:'demo',element:'memberNote'},target:{module:'demo',element:'id'}}],rule:{kind:'allow'}},
 ];
 for(const change of changes){const source=relatedSource();change(source);expect(compileTableDeployment({text:JSON.stringify(source),configuration}).status).toBe('blocked');}
 const unknown=relatedSource();payload(unknown).tables[0].policy.person.select.matches[0].future={retained:true};
 const checked=inspectTableLifecycle(unknown);expect(checked.valid).toBe(true);expect(checked.complete).toBe(false);
 expect((checked.source as any).modules[0].extensions['umf.tables'].tables[0].policy.person.select.matches[0].future).toEqual({retained:true});
});

test('nested field associations retain separate aliases and SQL null matching',()=>{
 const source=relatedSource(true),result=compileTableDeployment({text:JSON.stringify(source),configuration});
 if(result.status!=='compiled')throw Error(JSON.stringify(result));
 const sql=result.bundle.steps.find(step=>step.sourcePath.endsWith('/tables/0/policy/person/select'))!.sql;
 expect(sql).toContain('"umf_j_0"."bridgeGroup" = "umf_j_1"."note_id"');
 expect(sql).toContain('"related_schema"."notes"."id" = "umf_j_0"."bridgeNote"');
 expect(result.bundle.expectedCatalog.foreignKeys).toEqual([]);
});

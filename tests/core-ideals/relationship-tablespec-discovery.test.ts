import {describe,test,expect} from 'bun:test';
import {importTableSpec,exportTableSpec,importTableSpecBundle,exportTableSpecBundle} from '../../src/adapters/tablespec';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import type {Document} from '../../src/model/types';
import proof from '../../fixtures/validation/relationship-tablespec-discovery-native.json';

describe('TableSpec relationship native carrier discovery',()=>{
 // @covers US-045-AC3
 // @covers US-045-AC7
 for(const row of proof.cases)test(row.case+' retains original metadata without authored relationships',()=>{
  const text=JSON.stringify(row.source,null,2)+'\n';
  const doc=importTableSpec(text,{id:row.case,format:'json'});
  expect(doc.modules.every(m=>!Object.hasOwn(m,'relationships'))).toBe(true);
  expect(doc.modules.flatMap(m=>m.elements).every(e=>!Object.hasOwn(e,'keys'))).toBe(true);
  for(const format of ['json','yaml'] as const){
   const restored=readJsonValue(writeJsonValue(doc,format),format) as unknown as Document;
   expect(exportTableSpec(restored)).toBe(text);
  }
 });
 test('native model validation does not prove endpoint resolution or bound coherence',()=>{
  for(const name of ['unresolved-source','unresolved-target','duplicate-foreign-key','malformed-multiplicity','contradictory-cardinality','lookup-and-expression']){
   const row=proof.cases.find(r=>r.case===name)!;expect(row.runtimeAccepted).toBe(true);expect(row.checkedSchemaAccepted).toBe(true);
  }
  const invalid=proof.cases.find(r=>r.case==='invalid-confidence')!;
  expect(invalid.runtimeAccepted).toBe(false);expect(invalid.checkedSchemaAccepted).toBe(false);
 });
 // @covers US-045-AC7
 test('split relationship metadata, unknown sidecars and numeric lexemes remain exact',()=>{
  const files={'table.yaml':'version: "1.0"\ntable_name: orders\nrelationships:\n  foreign_keys:\n    - column: id\n      references_table: customers\n      references_column: id\n      future: {n: 9007199254740993, decimal: 1.2300}\n',
   'columns/id.yaml':'column: {name: id, data_type: INTEGER}\n','notes.txt':'Unknown relationship metadata is retained.\n'};
  const doc=importTableSpecBundle(files,{id:'split'});
  for(const format of ['json','yaml'] as const)expect(exportTableSpecBundle(readJsonValue(writeJsonValue(doc,format),format) as unknown as Document)).toEqual(files);
 });
});

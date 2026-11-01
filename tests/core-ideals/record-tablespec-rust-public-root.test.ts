// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyTableSpecRecord,declareCoreElementKind,importTableSpec,verifyTableSpecRecordClassification} from '../../src/index-node-v4';

const sourceText='{"version":"1.0","table_name":"sales.Order","context_column":"provider","columns":[{"name":"id","data_type":"INTEGER"},{"name":"payload","data_type":"FUTURE","unknown":9007199254740993}]}\n';

test('Node V4 routes TableSpec Record classification and receipt verification through Rust',()=>{
 const source=importTableSpec(sourceText,{id:'record-public-root',format:'json'});
 const result=classifyTableSpecRecord(source,{recordModule:'records',recordId:'Order',mode:'strict'});
 expect(result.status).toBe('classified');
 expect(result.mappings.map(mapping=>mapping.kind)).toEqual(['field','field','record']);
 const target=result.target!;
 expect(target.modules.at(-1)!.elements[0]!.references).toEqual([
  {role:'member',module:'table',element:'column:0'},
  {role:'member',module:'table',element:'column:1'},
 ]);
 expect(target.modules[0]!.elements[1]!.scalarType).toBeUndefined();
 expect(verifyTableSpecRecordClassification(result,target)).toEqual(result);

 const conflict=importTableSpec(sourceText,{id:'record-public-refusal',format:'json'});
 const authored=declareCoreElementKind(conflict,{module:'table',element:'column:1'},'record');
 const conflictingSource=authored.target;
 const refused=classifyTableSpecRecord(conflictingSource,{recordModule:'records',recordId:'Order',mode:'report'});
 expect(refused.status).toBe('blocked');
 expect(refused.target).toBeUndefined();
 expect(refused.diagnostics.some(diagnostic=>diagnostic.code==='FIELD_KIND_CONFLICT')).toBe(true);
});

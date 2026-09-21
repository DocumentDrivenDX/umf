import {test,expect} from 'bun:test';
import {classifyTableSpecRecord,verifyTableSpecRecordClassification} from '../../src/core-ideals/tablespec-record';
import {declareCoreElementKind} from '../../src/model/field-kind';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {importTableSpec,importTableSpecBundle,exportTableSpec,exportTableSpecBundle} from '../../src/adapters/tablespec';
import {selectCoreElements} from '../../src/model/selection';
import {copyJson} from '../../src/model/json';
import {readDocument,writeDocument} from '../../src/model/document';
import {type Document} from '../../src/model/types';
const text=' {"version":"1.0","table_name":"sales.Order","context_column":"provider","columns":[{"name":"id","data_type":"INTEGER"},{"name":"payload","data_type":"FUTURE","unknown":9007199254740993}]}\n';
const source=()=>upgradeFieldEnvelope(importTableSpec(text,{id:'record',format:'json'})).target;
const options={recordModule:'records',recordId:'Order',mode:'strict' as const};
test('whole native table becomes a record with ordered explicit member references and unknown type preservation',()=>{
 const input=source(),result=classifyTableSpecRecord(input,options);expect(result.status).toBe('classified');expect(result.mappings.map(m=>m.kind)).toEqual(['field','field','record']);
 const target=result.target!,record=target.modules[1]!.elements[0]!;
 expect(record.kind).toBe('record');expect(record.references).toEqual([{role:'member',module:'table',element:'column:0'},{role:'member',module:'table',element:'column:1'}]);
 expect(Object.hasOwn(target.modules[0]!.elements[1]!,'scalarType')).toBe(false);expect(target.modules[0]!.elements.map(e=>e.kind)).toEqual(['field','field']);
 expect(selectCoreElements(target,{identities:[{module:'records',element:'Order'}],references:'transitive'}).selection).toHaveLength(3);
 expect(verifyTableSpecRecordClassification(result,target)).toEqual(result);
 for(const format of ['json','yaml'] as const)expect(exportTableSpec(readDocument(writeDocument(target,format),format))).toBe(text);
 expect(input.modules).toHaveLength(1);expect(Object.hasOwn(input.modules[0]!.elements[0]!,'kind')).toBe(false);
});
test('one conflicting member blocks the whole table in both modes without partial candidate',()=>{
 for(const mode of ['strict','report'] as const){
  const author=declareCoreElementKind(source(),{module:'table',element:'column:1'},'record');
  const result=classifyTableSpecRecord(author.target,{...options,mode,authors:[author]});
  expect(result.status).toBe('blocked');expect(Object.hasOwn(result,'target')).toBe(false);expect(result.diagnostics.some(d=>d.code==='FIELD_KIND_CONFLICT')).toBe(true);expect(result.source).toEqual(author.target);
  const unknown=source();unknown.modules[0]!.elements[1]!.kind='future-kind';expect(classifyTableSpecRecord(unknown,{...options,mode}).status).toBe('blocked');
 }
});
test('verified member authors are retained; stale, duplicate and unrelated receipts block',()=>{
 const all=source();for(const element of all.modules[0]!.elements)element.kind='field';
 const authors=all.modules[0]!.elements.map((element,index)=>{const before=copyJson(all) as unknown as Document;delete before.modules[0]!.elements[index]!.kind;return declareCoreElementKind(before,{module:'table',element:element.id},'field');});
 expect(classifyTableSpecRecord(all,{...options,authors}).status).toBe('classified');
 const author=declareCoreElementKind(source(),{module:'table',element:'column:1'},'field');
 expect(classifyTableSpecRecord(author.target,{...options,authors:[author]}).status).toBe('classified');
 expect(classifyTableSpecRecord(author.target,{...options,authors:[author,author]}).status).toBe('blocked');
 const changed=copyJson(author.target) as unknown as Document;changed.future=true;expect(classifyTableSpecRecord(changed,{...options,authors:[author]}).status).toBe('blocked');
 expect(classifyTableSpecRecord(source(),{...options,recordModule:'table'}).status).toBe('blocked');
});
test('record classification retains split files and empty tables without inventing grouping semantics',()=>{
 const files={'table.yaml':'version: "1.0"\ntable_name: T\ncolumns: [{shadowed: true}]\n','columns/x.yaml':'column: {name: x, data_type: INTEGER}\n','future.bin':'opaque\u0000'};
 const result=classifyTableSpecRecord(upgradeFieldEnvelope(importTableSpecBundle(files,{id:'split'})).target,options);
 expect(exportTableSpecBundle(result.target!)).toEqual(files);
 const empty=upgradeFieldEnvelope(importTableSpec('{"version":"1.0","table_name":"Empty","columns":[]}',{id:'empty',format:'json'})).target;
 const record=classifyTableSpecRecord(empty,options);expect(record.target!.modules[1]!.elements[0]!.references).toEqual([]);
});
test('changed member references, receipts and native content invalidate classification',()=>{
 const result=classifyTableSpecRecord(source(),options),changed=copyJson(result.target) as unknown as Document;
 changed.modules[1]!.elements[0]!.references!.reverse();expect(()=>verifyTableSpecRecordClassification(result,changed)).toThrow();
 result.mappings[0]!.nativePath='/forged';expect(()=>verifyTableSpecRecordClassification(result,result.target!)).toThrow();
});

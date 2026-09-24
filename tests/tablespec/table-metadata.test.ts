import {test,expect} from 'bun:test';
import {importTableSpec,importTableSpecBundle,getTableSpecTable,editTableSpecTable,readDocument,writeDocument,exportTableSpecBundle} from '../../src';
import {parseNativeJson,type NativeJson} from '../../src/model/native-json';
test('CONTRACT-030 table metadata inspection is exact, isolated and distinct from split source recovery',async()=>{
 const text='{"version":"1.0","table_name":"orders","primary_key":["id"],"context_column":"tenant","future":{"exact":9007199254740993,"negativeZero":-0,"decimal":1.2300},"columns":[{"name":"id","data_type":"INTEGER"}]}';
 const files={'table.yaml':text,'columns/id.yaml':'column: {name: actual, data_type: TEXT}\nderivation: {expression: opaque}\n','notes.txt':'retain sidecar'};
 const cases=[];
 for(const mode of ['monolithic','split'] as const){
  const source=mode==='monolithic'?importTableSpec(text,{id:mode,format:'json'}):importTableSpecBundle(files,{id:mode});
  const before=writeDocument(source,'json'),table=getTableSpecTable(source);
  expect(table.kind).toBe('object');if(table.kind!=='object')throw Error('Object required');
  expect(table.members.future).toEqual(parseNativeJson('{"exact":9007199254740993,"negativeZero":-0,"decimal":1.2300}'));
  expect(table.members.primary_key).toEqual(parseNativeJson('["id"]'));
  expect(table.members.columns).toEqual(parseNativeJson(mode==='monolithic'?'[{"name":"id","data_type":"INTEGER"}]':'[{"name":"actual","data_type":"TEXT","derivation":{"expression":"opaque"}}]'));
  const expected=structuredClone(table);
  table.members.future={kind:'null'};table.members.columns={kind:'array',items:[]};
  expect(writeDocument(source,'json')).toBe(before);expect(getTableSpecTable(source)).toEqual(expected);
  const changes:Record<string,NativeJson>={description:{kind:'string',value:'consumer edit'}};
  const edited=editTableSpecTable(source,changes);expect(getTableSpecTable(edited)).toEqual({...expected,members:{...expected.members,...changes}});
  for(const format of ['json','yaml'] as const)expect(getTableSpecTable(readDocument(writeDocument(source,format),format))).toEqual(expected);
  if(mode==='split')expect(exportTableSpecBundle(source)).toEqual(files);
  cases.push({source,expected});
 }
 await Bun.write('fixtures/tablespec/table-metadata.json',JSON.stringify({cases},null,2)+'\n');
});

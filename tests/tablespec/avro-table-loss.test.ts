import {test,expect} from 'bun:test';
import {importTableSpec,importTableSpecBundle,editTableSpecTable,projectTableSpecToAvro,readDocument,writeDocument,type TableSpecAvroPolicy} from '../../src';
import {parseNativeJson} from '../../src/model/native-json';
const policy:TableSpecAvroPolicy={id:'target',recordName:'Target',namespace:'example',context:'sales',lossPolicy:'allow-reported-loss',fields:{id:{name:'id',representation:'int32',nullable:'source'}}};
test('CONTRACT-033 table keys, context dispatch and opaque metadata survive edits and report path-specific losses',async()=>{
 const native={version:'1.0',table_name:'source',primary_key:['id'],context_column:'context','future/~':{exact:1},columns:[{name:'id',data_type:'INTEGER',nullable:{sales:false,support:true}},{name:'context',data_type:'VARCHAR',nullable:false}]};
 const text=JSON.stringify(native).replace('"exact":1','"exact":9007199254740993');
 const cases=[];
 for(const mode of ['monolithic','split']){
  const source=mode==='monolithic'?importTableSpec(text,{id:mode,format:'json'}):importTableSpecBundle({'table.yaml':text,'columns/01-id.yaml':JSON.stringify({column:native.columns[0]}),'columns/02-context.yaml':JSON.stringify({column:native.columns[1]}),'notes.txt':'keep'},{id:mode});
  const original=writeDocument(source,'json');
  const edited=editTableSpecTable(source,{table_name:parseNativeJson('"renamed"'),primary_key:parseNativeJson('["id","context"]')});
  const result=projectTableSpecToAvro(edited,policy);
  expect(result.status).toBe('projected');expect(result.source).toEqual(edited);expect(writeDocument(source,'json')).toBe(original);
  for(const [path,code] of [['/primary_key','PRIMARY_KEY_NOT_ENFORCED'],['/context_column','CONTEXT_DISPATCH_NOT_ENFORCED'],['/future~1~0','NATIVE_TABLE_METADATA'],['/columns/0/nullable','CONTEXT_SELECTED'],['/columns/1','COLUMN_OMITTED']])expect(result.issues).toContainEqual(expect.objectContaining({path,code,retainedInSource:true}));
  expect(JSON.parse(result.nativeSchema!).fields).toEqual([{name:'id',type:'int'}]);
  const strict=projectTableSpecToAvro(edited,{...policy,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();expect(strict.issues).toEqual(result.issues);
  for(const format of ['json','yaml'] as const)expect(projectTableSpecToAvro(readDocument(writeDocument(edited,format),format),policy)).toEqual(result);
  expect(writeDocument(result.source,'json')).toContain('9007199254740993');
  cases.push({mode,result});
 }
 await Bun.write('fixtures/tablespec/avro-table-losses.json',JSON.stringify({cases},null,2)+'\n');
});

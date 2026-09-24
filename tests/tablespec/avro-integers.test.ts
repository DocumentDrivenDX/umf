import {test,expect} from 'bun:test';
import {importTableSpec,projectTableSpecToAvro,readDocument,writeDocument,exportTableSpec,type TableSpecAvroPolicy} from '../../src';
test('CONTRACT-033 interpreted numeric qualifiers cannot round into supported decimal or vector shapes',async()=>{
 const cases=[];
 for(const key of ['precision','scale','dimension'])for(const token of ['1.0000000000000000001','1e-400','9007199254740993','-0']){
  const column=key==='dimension'?{name:'value',data_type:'EMBEDDING',dimension:'TOKEN',nullable:false}:{name:'value',data_type:'DECIMAL',precision:8,scale:1,nullable:false,[key]:'TOKEN'};
  const text=JSON.stringify({version:'1.0',table_name:'example',columns:[column]}).replace('"TOKEN"',token),source=importTableSpec(text,{id:key+token,format:'json'});
  const policy:TableSpecAvroPolicy={id:'target',recordName:'Record',namespace:'example',lossPolicy:'allow-reported-loss',fields:{value:{name:'value',representation:key==='dimension'?'embedding-float32':'decimal',nullable:'source',...(key==='dimension'?{itemsNullable:false}:{})}}};
  const result=projectTableSpecToAvro(source,policy);expect(result.status).toBe('blocked');expect(result.target).toBeUndefined();expect(result.issues).toContainEqual(expect.objectContaining({path:'/columns/0/'+key,code:'TABLESPEC_AVRO_UNSUPPORTED',retainedInSource:true}));expect(exportTableSpec(result.source)).toBe(text);
  for(const format of ['json','yaml'] as const)expect(projectTableSpecToAvro(readDocument(writeDocument(source,format),format),policy)).toEqual(result);
  cases.push({result,exports:[]});
 }
 const text='{"version":"1.0","table_name":"t","columns":[{"name":"n","data_type":"DECIMAL","precision":8.00e0,"scale":1.00,"nullable":false,"unknown":9007199254740993.0000001}]}';
 const result=projectTableSpecToAvro(importTableSpec(text,{id:'exact',format:'json'}),{id:'target',recordName:'Record',namespace:'example',lossPolicy:'allow-reported-loss',fields:{n:{name:'n',representation:'decimal',nullable:'source'}}});
 expect(result.status).toBe('projected');expect(JSON.parse(result.nativeSchema!).fields[0].type).toEqual({type:'bytes',logicalType:'decimal',precision:8,scale:1});expect(exportTableSpec(result.source)).toBe(text);
 cases.push({result,exports:[]});await Bun.write('fixtures/tablespec/avro-integers.json',JSON.stringify({cases},null,2)+'\n');
});

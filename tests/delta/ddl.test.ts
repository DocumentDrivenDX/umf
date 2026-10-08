import {test,expect} from 'bun:test';
import {defineDeltaTable,generateDeltaDDL,DELTA_DEFINITION_EXTENSION} from '../../src/adapters/delta/ddl';
import {readDocument,writeDocument} from '../../src/model/document';
import {exportDeltaSchema} from '../../src/adapters/delta';

const schema=JSON.stringify({type:'struct',fields:[{name:'id',type:'long',nullable:false,metadata:{}},{name:'caption',type:'string',nullable:true,metadata:{}}]});
const definition={profile:'databricks-managed-delta/0.1' as const,name:['catalog','schema','items'],clusterBy:['id'],partitionBy:[],properties:{'delta.targetFileSize':'67108864'}};
test('authored Delta definition survives JSON and YAML and emits a complete managed CREATE',()=>{
  const source=defineDeltaTable(schema,definition,{id:'items'}),original=JSON.stringify(source);
  for(const format of ['json','yaml'] as const){
    const recovered=readDocument(writeDocument(source,format),format),result=generateDeltaDDL(recovered);
    expect(exportDeltaSchema(recovered)).toBe(schema);
    expect(result.sql).toBe("CREATE TABLE `catalog`.`schema`.`items` (\n  `id` BIGINT NOT NULL,\n  `caption` STRING\n) USING DELTA CLUSTER BY (`id`)\nTBLPROPERTIES ('delta.targetFileSize'='67108864');\n");
    expect(result.definition).toEqual(definition);
  }
  expect(JSON.stringify(source)).toBe(original);
});
test('unknown definition and core content survive serialization but refuse executable export',()=>{
  for(const location of ['definition','document','vocabulary'] as const){
    const doc=defineDeltaTable(schema,definition,{id:'unknown'});
    if(location==='definition')(doc.extensions![DELTA_DEFINITION_EXTENSION] as Record<string,any>).future={exact:'18446744073709551615'};
    if(location==='document')doc.future={exact:'18446744073709551615'};
    if(location==='vocabulary')doc.vocabularies[DELTA_DEFINITION_EXTENSION]!.future=true;
    const recovered=readDocument(writeDocument(doc,'yaml'),'yaml');
    expect(JSON.stringify(recovered)).toContain('future');
    expect(()=>generateDeltaDDL(recovered)).toThrow();
  }
});
test('DDL refuses incompatible layouts, unsupported properties, expressions and stale columns',()=>{
  for(const changed of [
    {...definition,partitionBy:['id']},
    {...definition,clusterBy:['missing']},
    {...definition,clusterBy:['id','ID']},
    {...definition,name:['items; DROP TABLE secrets']},
    {...definition,properties:{'delta.future':'true'}},
    {...definition,properties:{'delta.targetFileSize':"1'); DROP TABLE secrets;--"}},
    {...definition,properties:{'delta.dataSkippingStatsColumns':'missing'}},
  ])expect(()=>defineDeltaTable(schema,changed,{id:'refuse'})).toThrow();
});
test('metadata, protocol dependent types, case collisions and unknown schema meaning are never discarded',()=>{
  for(const field of [
    {name:'id',type:'long',nullable:false,metadata:{'delta.columnMapping.id':1}},
    {name:'id',type:'variant',nullable:true,metadata:{}},
    {name:'id',type:'long',nullable:false,metadata:{},future:true},
  ])expect(()=>defineDeltaTable(JSON.stringify({type:'struct',fields:[field]}),definition,{id:'refuse'})).toThrow();
  expect(()=>defineDeltaTable(JSON.stringify({type:'struct',fields:[{name:'id',type:'long',nullable:false,metadata:{}},{name:'ID',type:'long',nullable:true,metadata:{}}]}),definition,{id:'collision'})).toThrow();
});
test('explicit partitioning and retention settings do not force maintenance off',()=>{
  const doc=defineDeltaTable(schema,{...definition,clusterBy:[],partitionBy:['id'],properties:{'delta.deletedFileRetentionDuration':'interval 14 days','delta.logRetentionDuration':'interval 30 days'}},{id:'partitioned'});
  const sql=generateDeltaDDL(doc).sql;
  expect(sql).toContain('PARTITIONED BY (`id`)');expect(sql).toContain('interval 14 days');
  expect(sql).not.toContain('DISABLE');expect(sql).not.toContain('LOCATION');expect(sql).not.toContain('IF NOT EXISTS');
});

test('decimal precision and scale remain exact through recovery and DDL',()=>{
  for(const type of ['decimal(1,0)','decimal(38,0)','decimal(38,38)','decimal(19,4)']){
    const text=JSON.stringify({type:'struct',fields:[{name:'id',type,nullable:false,metadata:{}}]});
    const doc=defineDeltaTable(text,definition,{id:'decimal'});
    for(const format of ['json','yaml'] as const){
      const recovered=readDocument(writeDocument(doc,format),format);
      expect(generateDeltaDDL(recovered).schemaJson).toBe(text);
      expect(generateDeltaDDL(recovered).sql).toContain(type.toUpperCase()+' NOT NULL');
    }
  }
  for(const type of ['decimal(0,0)','decimal(39,0)','decimal(2,3)','decimal(19,-1)','decimal(019,4)','decimal(19,04)','decimal(19, 4)','decimal(19,4); DROP TABLE items']){
    expect(()=>defineDeltaTable(JSON.stringify({type:'struct',fields:[{name:'id',type,nullable:true,metadata:{}}]}),definition,{id:'refuse'})).toThrow();
  }
});

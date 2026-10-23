// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {defineDeltaTable,generateDeltaDDL,generateDeltaDDLBundle,realizeSparkDelta4DDL,DELTA_DEFINITION_EXTENSION} from '../../src/adapters/delta/ddl';
import {readDocument,writeDocument} from '../../src/model/document';
import {exportDeltaSchema} from '../../src/adapters/delta';
import {hashCanonical} from '../../src/compilation/bundle/hash';

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


test('nested types preserve order, nullability and exact schema through both formats',()=>{
  const text=JSON.stringify({type:'struct',fields:[{name:'id',type:'long',nullable:false,metadata:{}},{name:'payload',nullable:true,metadata:{},type:{type:'struct',fields:[
    {name:'at',type:'timestamp_ntz',nullable:false,metadata:{}},
    {name:'tags',type:{type:'array',elementType:'string',containsNull:true},nullable:true,metadata:{}},
    {name:'amounts',type:{type:'map',keyType:'string',valueType:'decimal(19,4)',valueContainsNull:true},nullable:true,metadata:{}}
  ]}}]});
  const doc=defineDeltaTable(text,definition,{id:'nested'}),original=JSON.stringify(doc);
  for(const format of ['json','yaml'] as const){
    const result=generateDeltaDDL(readDocument(writeDocument(doc,format),format));
    expect(result.schemaJson).toBe(text);
    expect(result.sql).toContain('`payload` STRUCT<`at`: TIMESTAMP_NTZ NOT NULL, `tags`: ARRAY<STRING>, `amounts`: MAP<STRING, DECIMAL(19,4)>>');
  }
  expect(JSON.stringify(doc)).toBe(original);
});
test('nested unsupported meaning and collection nullability refuse without source mutation',()=>{
  for(const type of [
    {type:'array',elementType:'long',containsNull:false},
    {type:'array',elementType:'long',containsNull:true,future:true},
    {type:'map',keyType:'string',valueType:'long'},
    {type:'map',keyType:'string',valueType:'long',valueContainsNull:false},
    {type:'struct',fields:[{name:'x',type:'long',nullable:true,metadata:{future:true}}]},
    {type:'struct',fields:[{name:'x',type:'long',nullable:true,metadata:{}},{name:'X',type:'string',nullable:true,metadata:{}}]},
    {type:'array',containsNull:true,elementType:{type:'struct',fields:[{name:'x',type:'long',nullable:false,metadata:{}}]}},
  ]){
    const doc=defineDeltaTable(schema,definition,{id:'refusal'});
    // Retain the unsupported schema independently; no failed export may mutate it.
    const retained=JSON.stringify(type);
    expect(()=>defineDeltaTable(JSON.stringify({type:'struct',fields:[{name:'id',type,nullable:true,metadata:{}}]}),definition,{id:'refusal'})).toThrow();
    expect(JSON.stringify(type)).toBe(retained);
    expect(generateDeltaDDL(doc).schemaJson).toBe(schema);
  }
});

test('complex columns cannot accidentally become partition or clustering keys',()=>{
  const text=JSON.stringify({type:'struct',fields:[{name:'id',type:{type:'array',elementType:'string',containsNull:true},nullable:true,metadata:{}}]});
  for(const layout of [{clusterBy:['id'],partitionBy:[]},{clusterBy:[],partitionBy:['id']}])expect(()=>defineDeltaTable(text,{...definition,...layout},{id:'complex-layout'})).toThrow();
});


test('column comments preserve exact schema, Unicode and escaped literals at both depths',()=>{
  const text=JSON.stringify({type:'struct',fields:[{name:'id',type:'long',nullable:false,metadata:{comment: "Owner's \\ path 雪"}},
    {name:'payload',nullable:true,metadata:{comment:''},type:{type:'struct',fields:[{name:'label',type:'string',nullable:true,metadata:{comment:'Nested label'}}]}}]});
  const doc=defineDeltaTable(text,definition,{id:'comments'}),original=JSON.stringify(doc);
  for(const format of ['json','yaml'] as const){
    const result=generateDeltaDDL(readDocument(writeDocument(doc,format),format));
    expect(result.schemaJson).toBe(text);
    expect(result.sql).toContain("BIGINT NOT NULL COMMENT 'Owner\\'s \\\\ path 雪'");
    expect(result.sql).toContain("STRUCT<`label`: STRING COMMENT 'Nested label'> COMMENT ''");
  }
  expect(JSON.stringify(doc)).toBe(original);
});

test('Spark Delta 4 realization preserves source and explicitly disposes every authored layout choice',()=>{
  const authored={...definition,properties:{
    'delta.targetFileSize':'67108864',
    'delta.parquet.compression.codec':'zstd',
    'delta.dataSkippingStatsColumns':'id,caption',
    'delta.deletedFileRetentionDuration':'interval 14 days'
  }};
  const doc=defineDeltaTable(schema,authored,{id:'spark-delta4'}),source=JSON.stringify(doc);
  const managed=generateDeltaDDL(doc),local=realizeSparkDelta4DDL(doc,{kind:'relation',relation:['local_catalog','local_schema','items'],location:'/tmp/delta/items'});
  expect(JSON.stringify(doc)).toBe(source);
  expect(generateDeltaDDL(doc)).toEqual(managed);
  expect(local.targetProfile).toBe('spark-delta4/0.1');
  expect(local.realizationProfile).toBe('umf.delta.spark-realization/0.1.0');
  expect(local.target.relation).toEqual(['local_catalog','local_schema','items']);
  expect(local.target.location).toBe('/tmp/delta/items');
  expect(local.sql).toContain('CREATE TABLE `local_catalog`.`local_schema`.`items`');
  expect(local.sql).toContain("LOCATION '/tmp/delta/items'\nTBLPROPERTIES");
  expect(local.schemaJson).toBe(schema);
  expect(local.sql).toContain("'delta.dataSkippingStatsColumns'='id,caption'");
  expect(local.sql).toContain("'delta.deletedFileRetentionDuration'='interval 14 days'");
  expect(local.sql).not.toContain('delta.parquet.compression.codec');
  expect(local.sql).not.toContain('delta.targetFileSize');
  expect(local.writerSettings).toEqual([{key:'spark.sql.parquet.compression.codec',value:'zstd'}]);
  expect(local.dispositions.map(({sourcePointer,outcome})=>[sourcePointer,outcome])).toEqual([
    ['/extensions/umf.delta.definition/clusterBy','sql'],
    ['/extensions/umf.delta.definition/partitionBy','none-authored'],
    ['/extensions/umf.delta.definition/properties/delta.dataSkippingStatsColumns','sql'],
    ['/extensions/umf.delta.definition/properties/delta.deletedFileRetentionDuration','sql'],
    ['/extensions/umf.delta.definition/properties/delta.parquet.compression.codec','writer-setting'],
    ['/extensions/umf.delta.definition/properties/delta.targetFileSize','unrealized-performance-hint']
  ]);
  expect(local.dispositions.at(-1)?.authoredValue).toBe('67108864');
  expect(local.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  expect(local.schemaSha256).toMatch(/^[a-f0-9]{64}$/);
});

test('Spark Delta 4 realization refuses unmapped codecs and records empty collections',()=>{
  const empty=defineDeltaTable(schema,{...definition,clusterBy:[],properties:{}},{id:'empty'});
  const target={kind:'relation' as const,relation:['local','schema','empty'],location:'/tmp/empty'};
  expect(realizeSparkDelta4DDL(empty,target).dispositions).toEqual([
    {sourcePointer:'/extensions/umf.delta.definition/clusterBy',authoredValue:[],outcome:'none-authored',explanation:'No columns were authored for this layout choice.'},
    {sourcePointer:'/extensions/umf.delta.definition/partitionBy',authoredValue:[],outcome:'none-authored',explanation:'No columns were authored for this layout choice.'},
    {sourcePointer:'/extensions/umf.delta.definition/properties',authoredValue:{},outcome:'none-authored',explanation:'No table properties were authored.'}
  ]);
  const nonZstd=defineDeltaTable(schema,{...definition,properties:{'delta.parquet.compression.codec':'snappy'}},{id:'codec-refusal'});
  expect(()=>realizeSparkDelta4DDL(nonZstd,target)).toThrow(/writer mapping is not qualified/);
  const unknown=defineDeltaTable(schema,definition,{id:'unknown-realization'});
  (unknown.extensions![DELTA_DEFINITION_EXTENSION] as Record<string,unknown>).futureMeaning='retain';
  expect(()=>realizeSparkDelta4DDL(unknown,target)).toThrow();
});

test('Spark Delta 4 target binding is typed and original property validation precedes projection',()=>{
  const valid=defineDeltaTable(schema,definition,{id:'target-bindings'});
  const localTarget={kind:'relation' as const,relation:['local','schema','owner'],location:"/tmp/delta/owner's\\table"};
  const result=realizeSparkDelta4DDL(valid,localTarget);
  expect(result.sql).toContain("CREATE TABLE `local`.`schema`.`owner` ");
  expect(result.sql).toContain("LOCATION '/tmp/delta/owner\\'s\\\\table';");
  expect(result.target.identitySha256).toBe(hashCanonical({profile:'spark-delta4/0.1',...localTarget}));
  expect(result.definition.name).toEqual(definition.name);
  for(const target of [
    {kind:'relation',relation:['local','schema','bad; DROP TABLE x'],location:'/tmp/items'},
    {kind:'relation',relation:['local','schema','items'],location:'/tmp/../items'},
    {kind:'relation',relation:['local','schema','items'],location:'/tmp//items'},
    {kind:'relation',relation:['local','schema','items'],location:'/tmp/items/'},
    {kind:'relation',relation:['local','schema','items'],location:'/tmp/has\ncontrol'},
    {kind:'relation',relation:['local','schema','items'],location:'relative/items'},
  ])expect(()=>realizeSparkDelta4DDL(valid,target)).toThrow();

  for(const [key,value] of [['delta.targetFileSize','0'],['delta.parquet.compression.codec','not-a-codec']]){
    const malformed=defineDeltaTable(schema,definition,{id:'malformed'});
    ((malformed.extensions![DELTA_DEFINITION_EXTENSION] as Record<string,any>).properties as Record<string,string>)[key!]=value!;
    expect(()=>realizeSparkDelta4DDL(malformed,{kind:'relation',relation:['local','schema','bad'],location:'/tmp/bad'})).toThrow();
  }
});

test('Spark Delta 4 path target binds an exact local Delta path without a metastore relation',()=>{
  const valid=defineDeltaTable(schema,definition,{id:'path-target'});
  const target={kind:'delta-path' as const,path:"/tmp/delta/owner's\\table`quoted`"};
  const result=realizeSparkDelta4DDL(valid,target);
  expect(result.sql).toContain("CREATE TABLE delta.`/tmp/delta/owner's\\table``quoted``` (");
  expect(result.sql).not.toContain(' LOCATION ');
  expect(result.target).toEqual({profile:'spark-delta4/0.1',...target,
    identitySha256:hashCanonical({profile:'spark-delta4/0.1',...target})});
  expect(()=>realizeSparkDelta4DDL(valid,{...target,location:'/tmp/elsewhere'} as any)).toThrow();
  expect(()=>realizeSparkDelta4DDL(valid,{...target,kind:'unknown'} as any)).toThrow();
});

test('comment metadata refuses unknown meaning, controls and client macros',()=>{
  for(const metadata of [{comment:1},{comment:null},{comment:'unsafe\ntext'},{comment:'$widget'},{comment:'ok',future:true}]){
    const text=JSON.stringify({type:'struct',fields:[{name:'id',type:'long',nullable:true,metadata}]});
    expect(()=>defineDeltaTable(text,definition,{id:'bad-comment'})).toThrow();
  }
});

test('bundle preserves ordered complete proposals and detached source recovery',()=>{
  const inputs=['second','first'].map(id=>defineDeltaTable(schema,{...definition,name:['catalog','schema',id]},{id}));
  const original=JSON.stringify(inputs);
  const result=generateDeltaDDLBundle(inputs);
  expect(result.tables.map(table=>table.documentId)).toEqual(['second','first']);
  expect(result.sql).toBe(inputs.map(doc=>generateDeltaDDL(doc).sql).join('\n'));
  for(const table of result.tables)expect(table.schemaJson).toBe(schema);
  result.tables[0]!.definition.name[0]='changed';
  expect(JSON.stringify(inputs)).toBe(original);
  for(const format of ['json','yaml'] as const){
    expect(generateDeltaDDLBundle(inputs.map(doc=>readDocument(writeDocument(doc,format),format))).sql).toBe(result.sql);
  }
});

test('bundle refuses partial export, ambiguous context and identity collisions',()=>{
  const first=defineDeltaTable(schema,definition,{id:'first'});
  const second=defineDeltaTable(schema,{...definition,name:['catalog','schema','other']},{id:'second'});
  const unsupported=readDocument(writeDocument(second,'json'),'json');
  (unsupported.extensions![DELTA_DEFINITION_EXTENSION] as Record<string,any>).future=true;
  const original=JSON.stringify([first,unsupported]);
  expect(()=>generateDeltaDDLBundle([first,unsupported])).toThrow();
  expect(JSON.stringify([first,unsupported])).toBe(original);
  expect(()=>generateDeltaDDLBundle([])).toThrow();
  expect(()=>generateDeltaDDLBundle([first,defineDeltaTable(schema,{...definition,name:['CATALOG','SCHEMA','ITEMS']},{id:'other'})])).toThrow();
  expect(()=>generateDeltaDDLBundle([first,defineDeltaTable(schema,{...definition,name:['catalog','schema','other']},{id:'first'})])).toThrow();
  expect(()=>generateDeltaDDLBundle([defineDeltaTable(schema,{...definition,name:['items']},{id:'short'})])).toThrow();
});

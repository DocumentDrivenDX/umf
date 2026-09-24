import {test,expect} from 'bun:test';
import {projectSqlServerToDdl,importSqlServerCatalog,exportSqlServerCatalog,proposeSqlServerCatalogEdit,readDocument,writeDocument,type SqlServerDdlPolicy,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/projections/sqlserver-ddl.schema.json';
const policy:SqlServerDdlPolicy={aliases:'base-type',physicalLayout:'default-rowstore',nativeExpressions:'verbatim',sourceState:'captured-only',lossPolicy:'allow-reported-loss'};
const ajv=createValidator();ajv.addSchema(coreSchema);const check=ajv.compile(schema);
test('CONTRACT-037 native captures lower deterministically with explicit source-addressable losses',async()=>{
 const cases=[];
 for(const file of ['catalog.json','constraints-catalog.json','indexes-catalog.json']){
  const source=importSqlServerCatalog(await Bun.file('fixtures/sqlserver/'+file).text(),{id:file}),result=projectSqlServerToDdl(source,policy);
  expect(check(result)).toBe(true);expect(result.status).toBe('projected');expect(result.source).toEqual(source);expect(result.statements.length).toBeGreaterThan(0);expect(result.issues.some(i=>i.code==='CAPTURE_LOWERING')).toBe(true);
  for(const format of ['json','yaml'] as const)expect(projectSqlServerToDdl(readDocument(writeDocument(source,format),format),policy)).toEqual(result);
  const strict=projectSqlServerToDdl(source,{...policy,lossPolicy:'strict'});expect(check(strict)).toBe(true);expect(strict.status).toBe('blocked');expect(strict.statements).toEqual([]);expect(strict.nativeSource).toBeUndefined();cases.push({file,source,result});
 }
 const types=cases[0]!.result;expect(types.nativeSource).toContain('IDENTITY(9007199254740993,1)');expect(types.issues.some(i=>i.code==='ALIAS_TO_BASE_TYPE')).toBe(true);expect(types.issues.some(i=>i.code==='COMPUTED_PERSISTENCE_UNAVAILABLE')).toBe(true);
 const indexes=cases[2]!.result;expect(indexes.issues.some(i=>i.code==='PARTITION_LAYOUT_LOWERED')).toBe(true);expect(indexes.issues.some(i=>i.code==='INDEX_LAYOUT_OMITTED')).toBe(true);
 expect(indexes.nativeSource).not.toContain('FILLFACTOR=0');expect(indexes.nativeSource).toContain('FILLFACTOR=80');expect(types.nativeSource).toContain('COLLATE Latin1_General_100_BIN2');
 await Bun.write('fixtures/sqlserver/ddl-projections.json',JSON.stringify({policy,cases},null,2)+'\n');
});
test('CONTRACT-037 unsupported observations never produce partial DDL; candidate edits require explicit policy',async()=>{
 const raw=await Bun.file('fixtures/sqlserver/indexes-catalog.json').json(),source=importSqlServerCatalog(JSON.stringify(raw),{id:'indexes'});
 const rejected=(edit:(c:any)=>void)=>{const c=structuredClone(raw);edit(c);const doc=importSqlServerCatalog(JSON.stringify(c),{id:'bad'}),result=projectSqlServerToDdl(doc,policy);expect(result.status).toBe('blocked');expect(result.nativeSource).toBeUndefined();expect(result.statements).toEqual([]);};
 rejected(c=>{c.tables.find((t:any)=>t.name==='Items').indexes.find((i:any)=>i.has_filter).filter_definition=null;});
 rejected(c=>{c.tables[0].columns[0].is_assembly_type=true;});
 rejected(c=>{c.tables[0].columns[0].collation_name='bad; SQL';});
 rejected(c=>{c.tables.find((t:any)=>t.name==='Heap').indexes.find((i:any)=>i.type===2).columns[0].key_ordinal=2;});
 const edited=proposeSqlServerCatalogEdit(source,'/tables/0/columns/0/is_nullable','true');expect(projectSqlServerToDdl(edited,policy).status).toBe('blocked');const candidate=projectSqlServerToDdl(edited,{...policy,sourceState:'allow-candidate'});expect(candidate.status).toBe('projected');expect(candidate.nativeSource).toContain('[region] int NULL');expect(exportSqlServerCatalog(source)).not.toEqual(exportSqlServerCatalog(edited));
 const alias=importSqlServerCatalog(await Bun.file('fixtures/sqlserver/catalog.json').text(),{id:'alias'});expect(projectSqlServerToDdl(alias,{...policy,aliases:'reject'}).status).toBe('blocked');
 source.modules[0]!.elements[0]!.name='stale';expect(()=>projectSqlServerToDdl(source,policy)).toThrow('disagree');
});
test('CONTRACT-037 identifiers and unknown metadata retain their boundaries',async()=>{
 const raw=await Bun.file('fixtures/sqlserver/indexes-catalog.json').json();raw.tables=raw.tables.filter((t:any)=>t.name==='Heap');raw.tables[0].name="odd]; name'";raw.tables[0].columns[0].description="a'quoted description";raw.tables[0].future={meaning:'opaque'};
 const source=importSqlServerCatalog(JSON.stringify(raw),{id:'quoted'}),result=projectSqlServerToDdl(source,policy);expect(result.status).toBe('projected');expect(result.nativeSource).toContain("[odd]]; name']");expect(result.nativeSource).toContain("N'a''quoted description'");expect(result.issues.some(i=>i.path==='/tables/0/future'&&i.code==='UNKNOWN_NATIVE_METADATA')).toBe(true);
 expect(()=>projectSqlServerToDdl(source,{...policy,nativeExpressions:'execute'} as any)).toThrow('policies required');
 let invoked=false;expect(()=>projectSqlServerToDdl(source,{...policy,get aliases(){invoked=true;return 'reject';}} as any)).toThrow();expect(invoked).toBe(false);
});
test('CONTRACT-037 native evidence matches current generation and records declared physical losses',async()=>{
 const evidence=await Bun.file('fixtures/sqlserver/ddl-oracle.json').json();expect(evidence.cases.length).toBe(3);
 expect(new Bun.CryptoHasher('sha256').update(await Bun.file('native/sqlserver/catalog-v3.sql').text()).digest('hex')).toBe(evidence.querySha256);
 for(const c of evidence.cases){
  expect(projectSqlServerToDdl(c.source,evidence.policy)).toEqual(c.result);
  expect(new Bun.CryptoHasher('sha256').update(await Bun.file('fixtures/sqlserver/'+c.file).text()).digest('hex')).toBe(c.sourceDdlSha256);
  expect(new Bun.CryptoHasher('sha256').update(c.result.nativeSource).digest('hex')).toBe(c.generatedDdlSha256);
  const original=JSON.parse(exportSqlServerCatalog(c.source));expect(c.generated.serverVersion).toBe('16.0.4295.3');
  for(const table of original.tables){
   const target=c.generated.tables.find((t:any)=>t.schema===table.schema&&t.name===table.name)!;
   for(const index of table.indexes){
    if(index.type===5||index.type===6){expect(target.indexes.some((i:any)=>i.name===index.name)).toBe(false);continue;}
    const regenerated=target.indexes.find((i:any)=>i.name===index.name)!;expect(regenerated).toBeDefined();
    const normalize=(i:any)=>{const value=structuredClone(i);delete value.index_id;delete value.data_space_id;delete value.data_space_name;delete value.data_space_type;for(const column of value.columns)column.partition_ordinal=0;return value;};
    expect(normalize(regenerated)).toEqual(normalize(index));
   }
  }
 }
 const types=evidence.cases[0];expect(types.persistence[0].rows).toEqual([{name:'computed',is_persisted:true}]);expect(types.persistence[1].rows).toEqual([{name:'computed',is_persisted:false}]);
 const indexes=evidence.cases[2];expect(indexes.layouts[0].rows.find((r:any)=>r.table_name==='Analytics').type_desc).toBe('CLUSTERED COLUMNSTORE');expect(indexes.layouts[1].rows.find((r:any)=>r.table_name==='Analytics').type_desc).toBe('HEAP');expect(indexes.layouts[0].rows.find((r:any)=>r.table_name==='Events').data_space_type).toBe('PARTITION_SCHEME');expect(indexes.layouts[1].rows.find((r:any)=>r.table_name==='Events').data_space_type).toBe('ROWS_FILEGROUP');
});
test('CONTRACT-037 copied edits survive native DDL execution without changing original captures',async()=>{
 const evidence=await Bun.file('fixtures/sqlserver/ddl-oracle.json').json();
 for(const c of evidence.cases){
  const candidate=c.candidate;expect(candidate).toBeDefined();expect(candidate.umfRecoveries).toBe(2);
  let edited=c.source;for(const edit of candidate.edits)edited=proposeSqlServerCatalogEdit(edited,edit.path,JSON.stringify(edit.value));
  expect(exportSqlServerCatalog(edited)).toBe(exportSqlServerCatalog(candidate.source));expect(JSON.parse(exportSqlServerCatalog(c.source)).state).toBe('captured');expect(JSON.parse(exportSqlServerCatalog(edited)).state).toBe('modified');
  const policy={...evidence.policy,sourceState:'allow-candidate' as const};expect(projectSqlServerToDdl(candidate.source,policy)).toEqual(candidate.projection);expect(projectSqlServerToDdl(candidate.source,evidence.policy).status).toBe('blocked');
  expect(candidate.projection.source.extensions['example.future']).toEqual({keep:'uninterpreted candidate context'});
  expect(new Bun.CryptoHasher('sha256').update(candidate.projection.nativeSource).digest('hex')).toBe(candidate.generatedDdlSha256);
  for(const edit of candidate.edits){const value=edit.path.slice(1).split('/').reduce((v:any,k:string)=>v[k],candidate.capture);expect(value).toEqual(edit.value);}
  const recaptured=importSqlServerCatalog(JSON.stringify(candidate.capture),{id:'recaptured:'+c.file});for(const format of ['json','yaml'] as const)expect(JSON.parse(exportSqlServerCatalog(readDocument(writeDocument(recaptured,format),format)))).toEqual(candidate.capture);
 }
 expect(evidence.cases[0].candidate.behavior).toEqual({flag:false,length:60});expect(evidence.cases[1].candidate.behavior).toEqual({quantityOneRejected:true,quantityTenAccepted:true});expect(evidence.cases[2].candidate.behavior).toEqual({activeOneDuplicatesAccepted:true,activeZeroDuplicateRejected:true,nullRegionAccepted:true});
});

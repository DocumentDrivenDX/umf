import {test,expect} from 'bun:test';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerIndexMetadata,proposeSqlServerCatalogEdit,inspectSqlServer,readDocument,writeDocument,projectSqlServerToAvro} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/sqlserver/index-metadata.schema.json';
const text=await Bun.file('fixtures/sqlserver/indexes-catalog.json').text(),source=importSqlServerCatalog(text,{id:'indexes'}),check=createValidator().compile(schema);
test('CONTRACT-031 index observations preserve physical ordering, filter and enforcement state',()=>{
 const native=JSON.parse(text),table=(name:string)=>native.tables.find((t:any)=>t.name===name),view=getSqlServerIndexMetadata(source);
 expect(check(view)).toBe(true);expect(view.complete).toBe(false);expect(view.tables.every(t=>t.available)).toBe(true);
 const filtered=table('Items').indexes.find((i:any)=>i.name==='UX_Items_active_email');
 expect(filtered).toMatchObject({type:2,is_unique:true,is_unique_constraint:false,has_filter:true,is_disabled:false,fill_factor:80,is_padded:true});expect(filtered.filter_definition).toContain('[active]=(1)');
 expect(filtered.columns.map((c:any)=>[c.name,c.key_ordinal,c.is_included_column,c.is_descending_key])).toEqual([['email',1,false,true],['payload',0,true,false]]);
 expect(table('Disabled').indexes.find((i:any)=>i.name==='UX_Disabled_code')).toMatchObject({is_unique:true,is_disabled:true});
 expect(table('Heap').indexes.find((i:any)=>i.index_id===0)).toMatchObject({name:null,type:0,type_desc:'HEAP'});
 const columnstore=table('Analytics').indexes[0];expect(columnstore.type).toBe(5);expect(columnstore.columns.map((c:any)=>c.key_ordinal)).toEqual([0,0,0]);expect(columnstore.columns.map((c:any)=>c.column_store_order_ordinal)).toEqual([1,2,0]);expect(columnstore.columns.every((c:any)=>c.is_included_column)).toBe(true);
 const partitioned=table('Events').indexes[0];expect(partitioned.data_space_type).toBe('PARTITION_SCHEME');expect(partitioned.columns.map((c:any)=>[c.name,c.partition_ordinal])).toEqual([['id',0],['day_id',1]]);
 for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(source,format),format);expect(getSqlServerIndexMetadata(back)).toEqual(view);expect(JSON.parse(exportSqlServerCatalog(back))).toEqual(native);}
 view.tables[0]!.indexes.length=0;expect(getSqlServerIndexMetadata(source).tables[0]!.indexes.length).toBeGreaterThan(0);
 const exact=text.replace('"type_desc": "CLUSTERED COLUMNSTORE"','"future":9007199254740993.123456789,"type_desc": "CLUSTERED COLUMNSTORE"');
 expect(exportSqlServerCatalog(readDocument(writeDocument(importSqlServerCatalog(exact,{id:'unknown'}),'yaml'),'yaml'))).toContain('9007199254740993.123456789');
});
test('CONTRACT-031 v3 requires observations; older, unavailable and unknown index semantics stay qualified',async()=>{
 for(const file of ['catalog.json','constraints-catalog.json']){const view=getSqlServerIndexMetadata(importSqlServerCatalog(await Bun.file('fixtures/sqlserver/'+file).text(),{id:file}));expect(view.tables.every(t=>!t.available&&t.indexes.length===0)).toBe(true);expect(check(view)).toBe(true);}
 expect(getSqlServerIndexMetadata(importSqlServerCatalog(await Bun.file('fixtures/sqlserver/indexes-empty.json').text(),{id:'empty'}))).toEqual({complete:false,tables:[]});
 const missing=JSON.parse(text);delete missing.tables[0].indexes;expect(()=>importSqlServerCatalog(JSON.stringify(missing),{id:'missing'})).toThrow('STRUCTURE');missing.profile='sqlserver-catalog-v2';expect(getSqlServerIndexMetadata(importSqlServerCatalog(JSON.stringify(missing),{id:'old'})).tables[0]!.available).toBe(false);
 const noConstraints=JSON.parse(text);delete noConstraints.tables[0].keys;expect(()=>importSqlServerCatalog(JSON.stringify(noConstraints),{id:'missing'})).toThrow('STRUCTURE');
 const duplicate=JSON.parse(text);duplicate.tables[0].indexes.push(duplicate.tables[0].indexes[0]);expect(()=>importSqlServerCatalog(JSON.stringify(duplicate),{id:'duplicate'})).toThrow('Duplicate index');
 const columns=JSON.parse(text);columns.tables[0].indexes[0].columns.push(columns.tables[0].indexes[0].columns[0]);expect(()=>importSqlServerCatalog(JSON.stringify(columns),{id:'duplicate-column'})).toThrow('Duplicate index column');
 const unknown=JSON.parse(text);unknown.tables[0].indexes[0].type=99;unknown.tables[0].indexes[0].type_desc='FUTURE';const future=importSqlServerCatalog(JSON.stringify(unknown),{id:'future'});expect(inspectSqlServer(future).diagnostics.some(d=>d.code==='SQLSERVER_INDEX_UNKNOWN')).toBe(true);expect(exportSqlServerCatalog(future)).toContain('FUTURE');
 const hidden=JSON.parse(text),filtered=hidden.tables.find((t:any)=>t.name==='Items').indexes.find((i:any)=>i.has_filter);filtered.filter_definition=null;const unavailable=importSqlServerCatalog(JSON.stringify(hidden),{id:'hidden'});expect(inspectSqlServer(unavailable).diagnostics.some(d=>d.code==='SQLSERVER_INDEX_FILTER_UNAVAILABLE')).toBe(true);
 const edited=proposeSqlServerCatalogEdit(source,'/tables/0/indexes/0/is_disabled','true');expect(JSON.parse(exportSqlServerCatalog(edited)).state).toBe('modified');expect(getSqlServerIndexMetadata(source)).not.toEqual(getSqlServerIndexMetadata(edited));expect(JSON.parse(exportSqlServerCatalog(source)).tables[0].indexes[0].is_disabled).toBe(false);
});
test('CONTRACT-032 index-specific losses accompany SQL Server to Avro projection',async()=>{
 const policy={id:'index-projection',recordName:'Item',namespace:'example.sales',table:{schema:'sales',name:'Items'},fields:{id:{name:'id',representation:'value' as const},email:{name:'email',representation:'value' as const},active:{name:'active',representation:'value' as const},payload:{name:'payload',representation:'value' as const}},lossPolicy:'allow-reported-loss' as const};
 const result=projectSqlServerToAvro(source,policy),indexes=getSqlServerIndexMetadata(source).tables.find(t=>t.table.name==='Items')!;
 expect(result.status).toBe('projected');expect(result.source).toEqual(source);expect(result.issues.filter(i=>i.code==='INDEX_NOT_REPRESENTED').map(i=>i.path)).toEqual(indexes.indexes.map((_,i)=>indexes.path+'/indexes/'+i));expect(projectSqlServerToAvro(source,{...policy,lossPolicy:'strict'}).status).toBe('blocked');
 const exports=[];for(const format of ['json','yaml'] as const){const back=readDocument(writeDocument(source,format),format);expect(projectSqlServerToAvro(back,policy)).toEqual(result);exports.push({format,capture:exportSqlServerCatalog(back)});}
 await Bun.write('fixtures/sqlserver/index-projection.json',JSON.stringify({source,policy,result,exports},null,2)+'\n');
});

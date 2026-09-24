import {test,expect} from 'bun:test';
import {importSqlServerCatalog,exportSqlServerCatalog,proposeSqlServerCatalogEdit,getSqlServerColumnMetadata,readDocument,writeDocument} from '../../src';
const source=await Bun.file('fixtures/sqlserver/catalog.json').text();
test('CONTRACT-031 declared catalog integers cannot be rounded into valid native identities or qualifiers',async()=>{
 const original=importSqlServerCatalog(source,{id:'integer-tokens'}),field=getSqlServerColumnMetadata(original)[0]!,before=writeDocument(original,'json');
 const cases=[];
 for(const key of ['system_type_id','user_type_id','column_id','max_length','precision','scale']){
  const column=field.nativeColumn;if(column.kind!=='object'||column.members[key]?.kind!=='number')throw Error('Missing numeric fixture');
  const token=column.members[key].value;
  for(const replacement of [token+'.0000000000000000001','9007199254740993','1e-400','-0']){
   const path=field.path+'/'+key;
   expect(()=>proposeSqlServerCatalogEdit(original,path,replacement)).toThrow('SQLSERVER_INTEGER');
   const raw=exportSqlServerCatalog(original),parsed=JSON.parse(raw);parsed.tables[0].columns[0][key]='REPLACE';
   const input=JSON.stringify(parsed).replace('"REPLACE"',replacement);
   expect(()=>importSqlServerCatalog(input,{id:'bad'})).toThrow('SQLSERVER_INTEGER');cases.push({path,replacement,input});
  }
 }
 expect(writeDocument(original,'json')).toBe(before);
 const native=JSON.parse(source);native.future='REPLACE';
 const extended=importSqlServerCatalog(JSON.stringify(native).replace('"REPLACE"','9007199254740993.0000000000000000001'),{id:'unknown'});
 for(const format of ['json','yaml'] as const)expect(exportSqlServerCatalog(readDocument(writeDocument(extended,format),format))).toContain('9007199254740993.0000000000000000001');
 const column=field.nativeColumn;if(column.kind!=='object'||column.members.system_type_id?.kind!=='number')throw Error('Missing ID');
 const exact=proposeSqlServerCatalogEdit(original,field.path+'/system_type_id',column.members.system_type_id.value+'.00e0');expect(getSqlServerColumnMetadata(exact)[0]!.element.scalarType).toBe(field.element.scalarType);
 await Bun.write('fixtures/sqlserver/integer-tokens.json',JSON.stringify({original,cases,extended,exact},null,2)+'\n');
});

// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../../model/types';
import type {SqlServerColumnMetadata} from '../../adapters/sqlserver';
import type {SqlServerIndexProjection} from './indexes';
type Engine={['binding-index-projection']:Record<'projectBindingIndexesToSqlServer',(fields?:Record<string,unknown>)=>unknown>};
type ColumnSource={getSqlServerColumnMetadata(document:Document):SqlServerColumnMetadata[]};
function maxLength(column:SqlServerColumnMetadata):number{
 const raw=column.nativeColumn;
 const value=raw.kind==='object'?raw.members.max_length:undefined;
 if(value?.kind!=='number')throw Object.assign(new Error('SQL Server catalog column has no exact max_length'),{code:'SQLSERVER_CAPTURE'});
 const parsed=Number(value.value);
 if(!Number.isSafeInteger(parsed))throw Object.assign(new Error('SQL Server catalog max_length is outside the exact integer range'),{code:'SQLSERVER_CAPTURE'});
 return parsed;
}
export function createBindingSqlServerIndexesRustDefault(engine:Engine,source:ColumnSource){
 return Object.freeze({projectBindingIndexesToSqlServer(logical:Document,binding:Document,nativeArchive:Document,nativeSource:string,lossPolicy:'strict'|'report'){
  const plannedColumns=source.getSqlServerColumnMetadata(nativeArchive).map(column=>({schema:column.table.schema,table:column.table.name,column:column.element.name!,maxLength:maxLength(column)}));
  return engine['binding-index-projection'].projectBindingIndexesToSqlServer({logical,binding,nativeArchive,nativeSource,plannedColumns,lossPolicy}) as SqlServerIndexProjection;
 }});
}

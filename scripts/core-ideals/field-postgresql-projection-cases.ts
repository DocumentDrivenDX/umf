import {declareCoreElementKind} from '../../src/model/field-kind';
import {type Document} from '../../src/model/types';
import {type FieldPostgresqlRequest} from '../../src/core-ideals/field-postgresql-projection';
export function postgresqlProjectionCases(){
 const types:FieldPostgresqlRequest['nativeType'][]=['boolean','smallint','integer','bigint','numeric','real','double precision','text','bytea','date','time','time with time zone','timestamp','timestamp with time zone'];
 return [...types.map((nativeType,i)=>({nativeType,tableName:'field_'+i,columnName:'value',description:'Chosen '+nativeType})),{nativeType:'text' as const,tableName:'quoted";--',columnName:'雪"value',description:"A quote '; and backslash \\ and newline\n雪"}].map((c,i)=>{
  const source:Document={umf:'0.2.0',id:'ideal-'+i,vocabularies:{},modules:[{id:'m',namespace:'sales',elements:[{id:'e',name:c.columnName,description:c.description,extensions:{}}]}]};
  const author=declareCoreElementKind(source,{module:'m',element:'e'},'field');
  const request:FieldPostgresqlRequest={id:'target-'+i,namespace:'sales',tableName:c.tableName,columnName:c.columnName,nativeType:c.nativeType,mode:'strict'};
  return {author,request};
 });
}

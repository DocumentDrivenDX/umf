import {CURRENT_CORE_VERSION} from '../../src/model/types';
// Synthetic current-core fixture for active operation/projection behavior.
import {declareCoreElementKind} from '../../src/model/field-kind';
import {type Document} from '../../src/model/types';
import {type FieldSqlServerRequest} from '../../src/core-ideals/field-sqlserver-projection';
export function sqlServerFieldCases(){return (['bit','tinyint','smallint','int','bigint','decimal(38,9)','real','float(53)','nvarchar(max)','varbinary(max)','date','time(7)','datetime2(7)','datetimeoffset(7)'] as const).map((nativeType,i)=>{
 const source:Document={umf:CURRENT_CORE_VERSION,id:'field',vocabularies:{},modules:[{id:'m',namespace:'sales',elements:[{id:'e',name:"v]雪'",description:"O'Brien ] 雪\nline",extensions:{}}]}]};
 const author=declareCoreElementKind(source,{module:'m',element:'e'},'field');const request:FieldSqlServerRequest={id:'native-'+i,namespace:'sales',tableName:'field_'+i,columnName:"v]雪'",nativeType,mode:'strict'};
 return {author,request,expectedTypeId:[104,48,52,56,127,106,59,62,231,165,40,41,42,43][i]!};
});}

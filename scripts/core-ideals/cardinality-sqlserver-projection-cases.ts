import {sqlServerCarriers} from '../../src/core-ideals/sqlserver-syntax';
import {declareCoreCardinality} from '../../src/model/cardinality';
import type {Document} from '../../src/model/types';
import type {CardinalitySqlServerRequest} from '../../src/core-ideals/cardinality-sqlserver-projection';
export function sqlserverCardinalityProjectionCases(){
 const rows=[];let i=0;
 for(const shape of ['one','array','map','unspecified'] as const)for(const storage of ['scalar','json-array','json-object'] as const)for(const mode of ['strict','report'] as const){
  const source:Document={umf:'0.4.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]};
  const author=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:shape});
  const request:CardinalitySqlServerRequest={id:'native-'+i,namespace:'dbo',tableName:'cardinality_'+i++,columnName:'value',nativeType:storage==='scalar'?'int':'nvarchar(max)',storage,mode,requireExactValues:false};
  rows.push({author,request});
 }
 for(const shape of ['array','map'] as const)for(const item of ['scalar','nested','self'] as const)for(const availability of ['required','absent-allowed'] as const)for(const mode of ['strict','report'] as const){
  const source:Document={umf:'0.4.0',id:'ideal-items',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',nullability:availability,extensions:{future:{unknown:{token:'9007199254740993',meaning:'uninterpreted'}}}},{id:'item',kind:'field',nullability:availability==='required'?'absent-allowed':'required',...(item==='scalar'?{scalarType:'float'}:{cardinality:'array',itemType:{module:'m',element:'item'}}),extensions:{future:{nativeRule:'preserve'}}}]}]};
  const author=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:shape,itemType:{module:'m',element:item==='self'?'f':'item'}});
  const request:CardinalitySqlServerRequest={id:'native-'+i,namespace:'dbo',tableName:'cardinality_'+i++,columnName:'value',nativeType:'nvarchar(max)',storage:shape==='map'?'json-object':'json-array',mode,requireExactValues:true};
  rows.push({author,request});
 }
 for(const nativeType of Object.keys(sqlServerCarriers) as (keyof typeof sqlServerCarriers)[])for(const requireExactValues of [false,true])for(const mode of ['strict','report'] as const){
  const source:Document={umf:'0.4.0',id:'scalar-ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',scalarType:sqlServerCarriers[nativeType],extensions:{}}]}]};
  const author=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:'one'});
  const request:CardinalitySqlServerRequest={id:'native-'+i,namespace:'dbo',tableName:'cardinality_'+i++,columnName:'value',nativeType,storage:'scalar',mode,requireExactValues};
  rows.push({author,request});
 }
 return rows;
}

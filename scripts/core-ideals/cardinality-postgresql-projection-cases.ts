import {declareCoreCardinality} from '../../src/model/cardinality';
import type {Document} from '../../src/model/types';
import type {CardinalityPostgresqlRequest} from '../../src/core-ideals/cardinality-postgresql-projection';
export function postgresqlCardinalityProjectionCases(){
 const rows=[];let i=0;
 for(const shape of ['one','array','map','unspecified'] as const)for(const storage of ['scalar','array','jsonb-object'] as const)for(const mode of ['strict','report'] as const){
  const source:Document={umf:'0.4.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]};
  const author=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:shape});
  const request:CardinalityPostgresqlRequest={id:'native-'+i,namespace:'public',tableName:'cardinality_'+i++,columnName:'value',nativeType:storage==='jsonb-object'?'jsonb':'integer',storage,mode,requireExactValues:false};
  rows.push({author,request});
 }
 for(const shape of ['array','map'] as const)for(const item of ['scalar','nested','self'] as const)for(const availability of ['required','absent-allowed'] as const)for(const mode of ['strict','report'] as const){
  const source:Document={umf:'0.4.0',id:'ideal-items',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',nullability:availability,extensions:{future:{unknown:{token:'9007199254740993',meaning:'uninterpreted'}}}},{id:'item',kind:'field',nullability:availability==='required'?'absent-allowed':'required',...(item==='scalar'?{scalarType:'float'}:{cardinality:'array',itemType:{module:'m',element:'item'}}),extensions:{future:{nativeRule:'preserve'}}}]}]};
  const author=declareCoreCardinality(source,{module:'m',element:'f'},{cardinality:shape,itemType:{module:'m',element:item==='self'?'f':'item'}});
  const request:CardinalityPostgresqlRequest={id:'native-'+i,namespace:'public',tableName:'cardinality_'+i++,columnName:'value',nativeType:shape==='map'?'jsonb':'integer',storage:shape==='map'?'jsonb-object':'array',mode,requireExactValues:true};
  rows.push({author,request});
 }
 return rows;
}

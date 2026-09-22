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
 return rows;
}

// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../../model/types';
import type {SqlServerTablePolicy,SqlServerTableProjection} from '../binding-sqlserver-types';
type Engine={['binding-sqlserver-tables']:Record<'projectBindingTablesToSqlServer'|'projectBindingTablesAndIndexesFromPlanToSqlServer'|'projectBindingTablesAndIndexesToSqlServer',(fields?:Record<string,unknown>)=>unknown>};
export function createBindingSqlServerTablesRustDefault(engine:Engine){
 return Object.freeze({
  projectBindingTablesToSqlServer(logical:Document,binding:Document,policy:SqlServerTablePolicy,lossPolicy:'strict'|'report',nativeSource?:string){
   return engine['binding-sqlserver-tables'].projectBindingTablesToSqlServer({logical,binding,policy,lossPolicy,...(nativeSource===undefined?{}:{nativeSource})}) as SqlServerTableProjection;
  },
  projectBindingTablesAndIndexesFromPlanToSqlServer(logical:Document,binding:Document,policy:SqlServerTablePolicy,lossPolicy:'strict'|'report',nativeSource?:string){
   return engine['binding-sqlserver-tables'].projectBindingTablesAndIndexesFromPlanToSqlServer({logical,binding,policy,lossPolicy,...(nativeSource===undefined?{}:{nativeSource})}) as SqlServerTableProjection;
  },
  projectBindingTablesAndIndexesToSqlServer(logical:Document,binding:Document,policy:SqlServerTablePolicy,nativeSource:string,lossPolicy:'strict'|'report'){
   return engine['binding-sqlserver-tables'].projectBindingTablesAndIndexesToSqlServer({logical,binding,policy,nativeSource,lossPolicy}) as SqlServerTableProjection;
  },
 });
}

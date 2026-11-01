// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {SqlServerPlannedColumn,SqlServerPlannedIndexProjection} from './binding-sqlserver/indexes';
type Engine={['binding-sqlserver-planned-index-projection']:Record<'projectBindingIndexesAgainstSqlServerPlan',(fields?:Record<string,unknown>)=>unknown>};
export function createBindingSqlServerPlannedIndexRustDefault(engine:Engine){
 return Object.freeze({
  projectBindingIndexesAgainstSqlServerPlan(logical:Document,binding:Document,plannedColumns:SqlServerPlannedColumn[],lossPolicy:'strict'|'report'){
   return engine['binding-sqlserver-planned-index-projection'].projectBindingIndexesAgainstSqlServerPlan({logical,binding,plannedColumns,lossPolicy}) as SqlServerPlannedIndexProjection;
  },
 });
}

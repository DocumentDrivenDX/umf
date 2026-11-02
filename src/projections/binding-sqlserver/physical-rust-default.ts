// SPDX-License-Identifier: MIT OR Apache-2.0
import type {SqlServerPhysicalPolicy,SqlServerPhysicalProjection} from './index';
import type {Document} from '../../model/types';
type Engine={['binding-sqlserver-physical']:Record<'projectBindingToSqlServer'|'verifyBindingSqlServerProjection'|'recoverBindingSqlServerSources'|'recoverBindingSqlServerNative',(fields?:Record<string,unknown>)=>unknown>};
export function createBindingSqlServerPhysicalRustDefault(engine:Engine){
 return Object.freeze({
  projectBindingToSqlServer(logical:Document,binding:Document,policy:SqlServerPhysicalPolicy,lossPolicy:'strict'|'report',nativeSource?:string){
   return engine['binding-sqlserver-physical'].projectBindingToSqlServer({logical,binding,policy,lossPolicy,...(nativeSource===undefined?{}:{nativeSource})}) as SqlServerPhysicalProjection;
  },
  verifyBindingSqlServerProjection(input:SqlServerPhysicalProjection,current:string){
   return engine['binding-sqlserver-physical'].verifyBindingSqlServerProjection({receipt:input,current}) as SqlServerPhysicalProjection;
  },
  recoverBindingSqlServerSources(input:SqlServerPhysicalProjection,current:string){
   return engine['binding-sqlserver-physical'].recoverBindingSqlServerSources({receipt:input,current}) as {logical:Document;binding:Document;policy:SqlServerPhysicalPolicy};
  },
  recoverBindingSqlServerNative(input:SqlServerPhysicalProjection,current:string){
   return engine['binding-sqlserver-physical'].recoverBindingSqlServerNative({receipt:input,current}) as {sql:string;catalog?:string};
  },
 });
}

// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {ParquetBindingReport} from './binding-parquet';
type Engine={['binding-parquet-projection']:Record<'projectBindingToParquet',(fields?:Record<string,unknown>)=>unknown>};
export function createBindingParquetRustDefault(engine:Engine){
 return Object.freeze({
  projectBindingToParquet(logical:Document,binding:Document,lossPolicy:'strict'|'report',nativeArchive?:Document){
   return engine['binding-parquet-projection'].projectBindingToParquet({logical,binding,lossPolicy,...(nativeArchive===undefined?{}:{nativeArchive})}) as ParquetBindingReport;
  },
 });
}

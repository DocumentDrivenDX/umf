// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {IcebergBindingProjection} from './binding-iceberg-types';
type Engine={['binding-iceberg-projection']:Record<'projectBindingToIceberg',(fields?:Record<string,unknown>)=>unknown>};
export function createBindingIcebergRustDefault(engine:Engine){
 return Object.freeze({
  projectBindingToIceberg(logical:Document,binding:Document,nativeArchive:Document,lossPolicy:'strict'|'report'){
   return engine['binding-iceberg-projection'].projectBindingToIceberg({logical,binding,nativeArchive,lossPolicy}) as IcebergBindingProjection;
  },
 });
}

// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import type {DeltaBindingProjection} from './binding-delta/index';
type Engine={['binding-delta-projection']:Record<'projectBindingToDelta',(fields?:Record<string,unknown>)=>unknown>};
export function createBindingDeltaRustDefault(engine:Engine){
 return Object.freeze({
  projectBindingToDelta(logical:Document,binding:Document,nativeArchive:Document,lossPolicy:'strict'|'report'){
   return engine['binding-delta-projection'].projectBindingToDelta({logical,binding,nativeArchive,lossPolicy}) as DeltaBindingProjection;
  },
 });
}

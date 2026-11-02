// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from './errors';
import type {CoreModelPublicEngine} from './rust-public-default';
import type {Document,Json} from './types';
import type {CoreRecordIdentity} from './keys';
import type {CoreKeyMeaning} from './keys';
import type {CoreFacetMeaning} from './facets';

type PreparedSource={source:Document;validation:{valid:boolean;complete:boolean;diagnostics:unknown[]}};
type Engine=Pick<CoreModelPublicEngine,'prepareCoreInspection'|'coreInspectionView'>;
export interface PreparedCoreInspection {
  readonly operation:'prepare-core-inspection';readonly version:'1.0.0';readonly source:Document;readonly provenance:'unverified';
  keys(identity:CoreRecordIdentity):CoreKeyMeaning;
  facets(identity:CoreRecordIdentity):CoreFacetMeaning;
  schemaProperties(identity:CoreRecordIdentity):Record<string,Json>;
}
function freeze(value:unknown):void {
  if(value!==null&&typeof value==='object'&&!Object.isFrozen(value)){
    for(const child of Object.values(value))freeze(child);
    Object.freeze(value);
  }
}
/** Rust owns source admission, exact identity lookup and each selected meaning. */
export function createPreparedCoreInspectionRustDefault(engine:Engine,isNativeError:(error:unknown)=>boolean=()=>false){
  const call=<T>(work:()=>unknown):T=>{try{return work() as T;}catch(error){
    if(!isNativeError(error))throw error;
    const native=error as {code?:unknown;message?:unknown;path?:unknown};
    if(typeof native.code==='string'&&native.code.startsWith('CORE_INSPECTION_'))throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
    throw error;
  }};
  return Object.freeze({prepareCoreInspection(input:Document):PreparedCoreInspection{
    const prepared=call<PreparedSource>(()=>engine.prepareCoreInspection(input));
    freeze(prepared.source);freeze(prepared.validation);
    const source=prepared.source;
    return Object.freeze({operation:'prepare-core-inspection' as const,version:'1.0.0' as const,source,provenance:'unverified' as const,
      keys:(identity:CoreRecordIdentity)=>call<CoreKeyMeaning>(()=>engine.coreInspectionView(source,identity,'keys')),
      facets:(identity:CoreRecordIdentity)=>call<CoreFacetMeaning>(()=>engine.coreInspectionView(source,identity,'facets')),
      schemaProperties:(identity:CoreRecordIdentity)=>call<Record<string,Json>>(()=>engine.coreInspectionView(source,identity,'schemaProperties')),
    });
  }});
}

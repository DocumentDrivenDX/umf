// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../../model/json';
import {UmfError,type Diagnostic,type Document,type Validation} from '../../model/types';

/** Declarative identity only. Native versions and capabilities need separate qualification. */
export const RAW_TABLE_BINDING_SUBSET='typed-access-columns/0.1';
export const rawTableBindingProfiles=Object.freeze(
  (['lakebase','unity-catalog','spark-delta'] as const).map(system=>Object.freeze({
    system,subset:RAW_TABLE_BINDING_SUBSET,bindingProfile:'umf-binding-2' as const,
    vocabularyVersion:'0.2.0' as const,nativeQualification:'UNTESTED' as const,
    directions:Object.freeze([] as string[]),
  })),
);
export interface RawTableBindingTarget {platform:string;majorVersion:string}

type RustInspector={
  inspectRawTableBinding(binding:Document,logical:Document,target:RawTableBindingTarget,module:string):Validation;
};

/** Host admission and error presentation around the Rust-owned profile semantics. */
export function createRawTableBindingInspector(engine:RustInspector) {
 return function inspectRawTableBinding(binding:Document,logical:Document,target:RawTableBindingTarget,module:string):Validation {
  let admittedBinding:Document,admittedLogical:Document,admittedTarget:RawTableBindingTarget,admittedModule:string;
  try {
   admittedBinding=copyJson(binding) as unknown as Document;
   admittedLogical=copyJson(logical) as unknown as Document;
   admittedTarget=copyJson(target) as unknown as RawTableBindingTarget;
   admittedModule=module;
  } catch(error) {
   if(!(error instanceof UmfError))throw error;
   const diagnostic:Diagnostic={code:error.code,path:error.path,message:error.message,severity:'error'};
   return {valid:false,complete:false,diagnostics:[diagnostic]};
  }
  return engine.inspectRawTableBinding(admittedBinding,admittedLogical,admittedTarget,admittedModule);
 };
}

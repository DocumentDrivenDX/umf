// SPDX-License-Identifier: MIT OR Apache-2.0
import type {AccessProfile,AccessRequest,AccessResult,AccessSymbol,AccessDiagnostic,ResolvedRecord,AccessSymbolChange,Ref} from './compilation/ir/index';
import type {Document} from './model/types';

/** The subset of CodegenEngine used by the typed access compilation host. */
export interface AccessCompilationEngine {
 inspectAccessViews(document:unknown,selected:readonly Ref[],bindings?:readonly {sourceId:string;document:unknown}[],sourceId?:string):{records:unknown[];diagnostics:unknown[]};
 generateAccessPackage(request:unknown,profile:unknown):unknown;
 diffAccessPackages(before:unknown,after:unknown):unknown;
}

type WireAdmissionErrorGuard=(error:unknown)=>boolean;

/** Host adapter over the native CodegenEngine; it adds no admission semantics. */
export function createAccessCompilationRustDefault(engine:AccessCompilationEngine,isWireAdmissionError:WireAdmissionErrorGuard=()=>false){
 return {
  inspectAccessViews(document:Document,selected:readonly Ref[],bindings:readonly {sourceId:string;document:Document}[]=[],sourceId='logical'){
   try{return engine.inspectAccessViews(document,selected,bindings,sourceId) as {records:ResolvedRecord[];diagnostics:AccessDiagnostic[]};}
   catch(error){
    if(isWireAdmissionError(error)){
     const admission=error as {code?:unknown;message?:unknown;path?:unknown};
     if(admission.code==='UNSUPPORTED_VALUE'&&admission.message==='Unsupported JavaScript value type: undefined'&&typeof admission.path==='string'&&(admission.path==='/request/document'||admission.path.startsWith('/request/document/'))){
      return {records:[],diagnostics:[{code:'ACCESS',sourceId,pointer:'',message:'Authored access declaration violates ACCESS_SHAPE',accessCode:'ACCESS_SHAPE'}]};
     }
    }
    throw error;
   }
  },
  generateAccessPackage(request:AccessRequest,profile:AccessProfile){
   return engine.generateAccessPackage(request,profile) as AccessResult;
  },
  diffAccessPackages(before:AccessResult,after:AccessResult){
   return engine.diffAccessPackages(before,after) as AccessSymbolChange[];
  }
 };
}

export type {AccessRequest,AccessProfile,AccessResult,AccessSymbol,AccessSymbolChange};

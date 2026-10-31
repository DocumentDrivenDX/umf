// SPDX-License-Identifier: MIT OR Apache-2.0
import type {ErrorObject} from 'ajv';
import type {ExtensionPackage,Diagnostic,Validation} from '../model/types';
/** Explicit shared-engine capability; hosts initialize native or browser WASM. */
export interface KindRegistration {
  manifest: ExtensionPackage;
  kinds?:boolean;
  semantics?: (payload:unknown,context:{document:unknown;path:string;scope:string})=>Diagnostic[];
}
export interface ExtensionKindRuntime {
  validatePackagePayload?(manifest:ExtensionPackage,payload:unknown):ErrorObject[];
  listKinds(registry?:KindRegistration[]):unknown;
  getKind(reference:unknown,registry?:KindRegistration[]):unknown;
  inspectExtensionKinds(document:unknown,registry?:KindRegistration[]):unknown;
  validateDocument(document:unknown,registry?:KindRegistration[]):Validation;
}

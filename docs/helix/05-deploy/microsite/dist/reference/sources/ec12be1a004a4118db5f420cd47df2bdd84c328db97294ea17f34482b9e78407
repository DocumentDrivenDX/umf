// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/lakeview/package.json';
import {RegistryBase} from '../../registry/base';
import type {ExtensionKindRuntime} from '../../registry/kind-runtime';
import {UmfError,type Document,type Diagnostic,type ExtensionPackage} from '../../model/types';
import type {LakeviewIssue} from './projection-types';
export type {LakeviewIssue} from './projection-types';
export const LAKEVIEW_EXTENSION='umf.lakeview';
export const lakeviewPackage=manifest as unknown as ExtensionPackage;
export interface LakeviewOptions {id:string;title?:string;namespace?:string;}
export interface LakeviewImport {document:Document;issues:LakeviewIssue[];}
/** Host capability only: all native retention and data-shape semantics run in Rust. */
export interface LakeviewRuntime extends ExtensionKindRuntime {
  importLakeviewDashboard(source:string,options:LakeviewOptions):unknown;
  exportLakeviewDashboard(document:unknown):string;
  lakeviewDiagnostics(document:unknown):Diagnostic[];
}
function required(runtime:LakeviewRuntime|undefined):LakeviewRuntime {
  if(!runtime)throw new UmfError('LAKEVIEW_RUNTIME_REQUIRED','Initialize the shared native/WASM engine and pass it to the Lakeview adapter');
  return runtime;
}
export function lakeviewRegistry(runtime:LakeviewRuntime):RegistryBase {
  const engine=required(runtime);
  return new RegistryBase(engine).register(lakeviewPackage,undefined,{kinds:true,nativeValidator:'lakeview/0.2.0'});
}
export function inspectLakeview(document:Document,runtime:LakeviewRuntime){
  const registry=lakeviewRegistry(runtime);
  return runtime.validateDocument(document,registry.registrations());
}
export function importLakeviewDashboard(text:string,options:LakeviewOptions,runtime:LakeviewRuntime):LakeviewImport {
  return required(runtime).importLakeviewDashboard(text,options) as LakeviewImport;
}
export function exportLakeviewDashboard(document:Document,runtime:LakeviewRuntime):string {
  return required(runtime).exportLakeviewDashboard(document);
}
/** Strict UTF-8 boundary; retain an optional BOM as a source character. */
export function importLakeviewDashboardBytes(bytes:Uint8Array,options:LakeviewOptions,runtime:LakeviewRuntime):LakeviewImport {
  const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  return importLakeviewDashboard(text,options,runtime);
}
export function exportLakeviewDashboardBytes(document:Document,runtime:LakeviewRuntime):Uint8Array {
  return new TextEncoder().encode(exportLakeviewDashboard(document,runtime));
}
// Legacy projection remains available from the Rust-backed V4 public roots.
// This adapter barrel owns native Lakeview interchange only.
export type {LakeviewIds,LakeviewProjection} from './projection-types';

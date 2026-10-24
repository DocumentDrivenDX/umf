// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/lakeview/package.json';
import {Registry} from '../../registry/registry';
import type {ExtensionKindRuntime} from '../../registry/kind-runtime';
import {validateDocument} from '../../validation/document';
import {UmfError,type Document,type Diagnostic,type ExtensionPackage} from '../../model/types';
import type {LakeviewIssue} from './project';
export type {LakeviewIssue} from './project';
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
export function lakeviewRegistry(runtime:LakeviewRuntime):Registry {
  const engine=required(runtime);
  return new Registry(engine).register(lakeviewPackage,undefined,{kinds:true,nativeValidator:'lakeview/0.2.0'});
}
export function inspectLakeview(document:Document,runtime:LakeviewRuntime){return validateDocument(document,lakeviewRegistry(runtime));}
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
// Explicit compatibility view from PR42. It is never stored by the native
// importer: umf.dashboard 0.1 has a separate field model and narrower semantics.
export {projectLakeview as projectLakeviewToLegacyDashboard,type LakeviewIds,type LakeviewProjection} from './project';

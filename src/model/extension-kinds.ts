// SPDX-License-Identifier: MIT OR Apache-2.0
import {Registry} from '../registry/registry';
import {UmfError,type Document} from './types';
import type {ExtensionKindInspection} from '../generated/core-model';
export type {ExtensionKindReference,ExtensionKindDefinition,ExtensionKindListResult,ExtensionKindInspection,ExtensionKindEntry,ExtensionKindCoverage} from '../generated/core-model';
export type {ExtensionKindRuntime} from '../registry/kind-runtime';
/** Classification and validation are performed by the supplied shared engine. */
export function inspectExtensionKinds(document:Document,registry=new Registry()):ExtensionKindInspection {
  if(!registry.kindRuntime)throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED','Initialize the shared native/WASM engine and pass it to Registry');
  return registry.kindRuntime.inspectExtensionKinds(document,registry.registrations()) as ExtensionKindInspection;
}

// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreElementQuery,CoreElementSelection} from '../model/selection';
import type {Document} from '../model/types';
import type {Registry} from '../registry/registry';

/** Synchronous Rust host-input engine for the opt-in Core Element Selection route. */
export interface CoreElementSelectionRustEngine {
 selectCoreElements(source:unknown,query:unknown,registry?:Registry):unknown;
}

/** Preserve the public Selection signature while keeping Registry caller-owned and lazy. */
export function bindCoreElementSelectionRust(engine:CoreElementSelectionRustEngine) {
 return Object.freeze({
  selectCoreElements(source:Document,query:CoreElementQuery,registry:Registry|undefined=undefined):CoreElementSelection {
   return engine.selectCoreElements(source,query,registry) as CoreElementSelection;
  },
 });
}

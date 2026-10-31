// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJsonHostInput} from './src/host-json.js';
import {UmfError} from './src/json-schema.js';

/** Opt-in Rust-owned host-value admission, separate from the established package entrypoint. */
export function createCopyJsonHostInputEngine(module) {
  if (typeof module?.executeCopyJsonHostJson !== 'function') throw new Error('RUST_WASM_BINDING_MISSING');
  return Object.freeze({copyJson(value) { return copyJsonHostInput(module, value, UmfError); }});
}

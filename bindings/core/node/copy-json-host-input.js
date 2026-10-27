// SPDX-License-Identifier: MIT OR Apache-2.0
import {createRequire} from 'node:module';
import {copyJsonHostInput} from './src/host-json.js';
import {UmfError} from './src/json-schema.js';

const require = createRequire(import.meta.url);
const addon = require('./umf_core_node.node');

/** Opt-in Rust-owned host-value admission, separate from the established package entrypoint. */
export function createCopyJsonHostInputEngine() {
  if (typeof addon.executeCopyJsonHostJson !== 'function') throw new Error('RUST_NODE_BINDING_MISSING');
  return Object.freeze({copyJson(value) { return copyJsonHostInput(addon, value, UmfError); }});
}

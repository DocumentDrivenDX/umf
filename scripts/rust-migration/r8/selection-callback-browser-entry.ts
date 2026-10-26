// SPDX-License-Identifier: MIT OR Apache-2.0
// @ts-expect-error The private JavaScript host bridge has no declaration file.
import {coreOpaqueReturnHostInput, createCoreElementSelectionHostInputEngine} from '../../../bindings/core/wasm/src/host-json.js';
// @ts-expect-error The checked-in browser bundle is a generated JavaScript reference asset.
import {Registry, UmfError, selectCoreElements} from '../../../dist/umf.js';
// @ts-expect-error This private parity runner is authored as executable JavaScript.
import {runSelectionCallbackSuite} from './selection-callback-suite.mjs';

type Payload = {resources: Record<string, unknown>};

export function runSelectionCallbackBrowser(module: Record<string, unknown>, payload: Payload) {
  const engine = createCoreElementSelectionHostInputEngine(module, payload.resources, UmfError);
  const candidate = (source: unknown, query: unknown, registry: unknown) =>
    engine.selectCoreElements(source, query, registry);
  const carrierReceiver = {};
  const carrierArgument = {};
  const carrierResult = Object.freeze({valid: false, diagnostics: []});
  function validateDocument(this: object, document: unknown) {
    if (this !== carrierReceiver || document !== carrierArgument) throw new Error('opaque return receiver or argument changed');
    return carrierResult;
  }
  const returned = coreOpaqueReturnHostInput(module, validateDocument, carrierReceiver, carrierArgument, UmfError);
  const sentinel = Object.freeze({kind: 'opaque-return-thrown'});
  let thrownIdentity = false;
  try {
    coreOpaqueReturnHostInput(module, function() { throw sentinel; }, {}, {}, UmfError);
  } catch (error) {
    thrownIdentity = error === sentinel;
  }
  return {...runSelectionCallbackSuite({Registry, selectCoreElements, candidate}),
    opaqueReturnIdentity: returned === carrierResult, opaqueThrowIdentity: thrownIdentity};
}

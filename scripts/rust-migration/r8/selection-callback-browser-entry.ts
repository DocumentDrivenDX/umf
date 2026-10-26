// SPDX-License-Identifier: MIT OR Apache-2.0
// @ts-expect-error The private JavaScript host bridge has no declaration file.
import {coreElementSelectionHostInput} from '../../../bindings/core/wasm/src/host-json.js';
// @ts-expect-error The checked-in browser bundle is a generated JavaScript reference asset.
import {Registry, UmfError, selectCoreElements} from '../../../dist/umf.js';
// @ts-expect-error This private parity runner is authored as executable JavaScript.
import {runSelectionCallbackSuite} from './selection-callback-suite.mjs';

type Payload = {resources: Record<string, unknown>};

export function runSelectionCallbackBrowser(module: Record<string, unknown>, payload: Payload) {
  const candidate = (source: unknown, query: unknown, registry: unknown) =>
    coreElementSelectionHostInput(module, payload.resources, source, query, registry, UmfError);
  return runSelectionCallbackSuite({Registry, selectCoreElements, candidate});
}

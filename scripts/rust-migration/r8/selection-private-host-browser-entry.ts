// SPDX-License-Identifier: MIT OR Apache-2.0
// @ts-expect-error The private JavaScript host bridge has no declaration file.
import {coreElementSelectionHostInput} from '../../../bindings/core/wasm/src/host-json.js';

type Payload = {
  resources: Record<string, unknown>;
  source: unknown;
  queries: Record<string, unknown>;
  frozen: Record<string, unknown>;
};

export function runSelectionBrowserCases(payload: Payload) {
  const addon = (globalThis as typeof globalThis & {selectionWasmModule: Record<string, unknown>}).selectionWasmModule;
  const outcomes: Record<string, unknown> = {};
  for (const name of Object.keys(payload.queries)) {
    const result = coreElementSelectionHostInput(addon, payload.resources,
      payload.source, payload.queries[name], undefined, Error);
    const actual = JSON.stringify(result);
    const expected = JSON.stringify(payload.frozen[name]);
    outcomes[name] = {
      equal: actual === expected,
      prototype: Object.getPrototypeOf(result) === Object.prototype ? 'ordinary' : 'other',
      resultJson: actual,
    };
  }
  const collectPrototypes = (value: unknown, path: string, found: Array<{path: string; prototype: string}>) => {
    if (value === null || typeof value !== 'object') return;
    const isArray = Array.isArray(value);
    const prototype = Object.getPrototypeOf(value);
    found.push({path, prototype: isArray
      ? (prototype === Array.prototype ? 'array' : 'other')
      : (prototype === Object.prototype ? 'ordinary' : 'other')});
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) collectPrototypes(descriptor.value, `${path}/${key}`, found);
    }
  };
  const allPrototypes: Array<{path: string; prototype: string}> = [];
  collectPrototypes(coreElementSelectionHostInput(addon, payload.resources,
    payload.source, payload.queries.all, undefined, Error), '$', allPrototypes);
  const protoSource = structuredClone(payload.source) as Record<string, any>;
  Object.defineProperty(protoSource.extensions.future.opaque, '__proto__', {
    value: {retained: true}, writable: true, enumerable: true, configurable: true,
  });
  const protoResult = coreElementSelectionHostInput(addon, payload.resources,
    protoSource, payload.queries.all, undefined, Error);
  const opaque = protoResult.source.extensions.future.opaque;
  const ownProto = Object.getOwnPropertyDescriptor(opaque, '__proto__')?.value as {retained?: unknown} | undefined;
  const protoKeyPreserved = Object.getPrototypeOf(protoResult) === Object.prototype
    && Object.getPrototypeOf(protoResult.source) === Object.prototype
    && Object.getPrototypeOf(opaque) === Object.prototype
    && Object.hasOwn(opaque, '__proto__')
    && ownProto?.retained === true
    && Object.getPrototypeOf(ownProto) === Object.prototype
    && Object.getOwnPropertyDescriptor(Object.prototype, 'retained') === undefined;
  const sentinel = {selectionRegistryThrown: true};
  let calls = 0;
  let thrownIdentity = false;
  try {
    coreElementSelectionHostInput(addon, payload.resources,
      payload.source, payload.queries.all,
      {get() { calls++; throw sentinel; }}, Error);
  } catch (error) {
    thrownIdentity = error === sentinel;
  }
  return {outcomes, allPrototypes, protoKeyPreserved, registryThrow: {calls, thrownIdentity}};
}

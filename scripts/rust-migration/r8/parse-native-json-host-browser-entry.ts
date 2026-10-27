// SPDX-License-Identifier: MIT OR Apache-2.0
import {createJsonSchemaEngine} from '../../../bindings/core/wasm/index.js';
import {parseNativeJson as typescriptParse} from '../../../src/model/native-json.ts';
import {nonStringCases} from './json-schema-import-nonstring-cases.mjs';

const module = (globalThis as any).parseNativeJsonHostWasmModule;
const engine = createJsonSchemaEngine(module);
const observe = (fn: (value: any) => any, value: any, events: string[], sentinel: Error) => {
  try { return {kind: 'return', value: fn(value)}; }
  catch (error: any) { return {kind: 'throw', name: error?.name ?? typeof error, message: error?.message ?? String(error), code: error?.code ?? null, sameObject: error === sentinel}; }
};
(globalThis as any).parseNativeJsonHostResult = nonStringCases().map(fixture => {
  const typescriptEvents: string[] = [], rustEvents: string[] = [];
  const typescriptSentinel = Object.assign(new Error('nonstring host sentinel'), {code: 'HOST_SENTINEL'});
  const rustSentinel = Object.assign(new Error('nonstring host sentinel'), {code: 'HOST_SENTINEL'});
  const typescriptInput = fixture.makeInput(typescriptEvents, typescriptSentinel);
  const rustInput = fixture.makeInput(rustEvents, rustSentinel);
  return {
    id: fixture.id,
    typescript: {events: typescriptEvents, outcome: observe(typescriptParse, typescriptInput, typescriptEvents, typescriptSentinel)},
    rustWasm: {events: rustEvents, outcome: observe(value => engine.parseNativeJson(value), rustInput, rustEvents, rustSentinel)},
  };
});

import {readFile} from 'node:fs/promises';

// This file is only selected by the Node conditional package entry. Keep host
// filesystem access out of the browser runtime and preserve caller loaders.
let defaultModule;
export function loadDefaultWasmModule() {
  if (!defaultModule) {
    defaultModule = Promise.all([
      import('./pkg/umf_core_wasm.js'),
      readFile(new URL('./pkg/umf_core_wasm_bg.wasm', import.meta.url)),
    ]).then(([module, bytes]) => ({
      ...module,
      default: () => module.default({module_or_path: bytes}),
    })).catch(error => {
      defaultModule = undefined;
      throw error;
    });
  }
  return defaultModule;
}

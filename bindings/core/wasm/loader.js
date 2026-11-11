// Browser-safe default loader. Package builds may substitute a host loader.
export function loadDefaultWasmModule() {
  return import('./pkg/umf_core_wasm.js');
}

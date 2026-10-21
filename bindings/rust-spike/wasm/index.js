// Package entrypoint for the same engine operations exported from Rust/WASM.
const CRYPTO_REFUSAL = JSON.stringify({
  ok: false,
  code: 'CAPABILITY_REQUIRED',
  complete: false,
  message: 'This WASM engine requires browser Crypto.getRandomValues for the validator randomized hash-map seeds',
  diagnostics: [{code: 'CAPABILITY_REQUIRED', path: '', severity: 'error', message: 'Use a secure browser context that provides globalThis.crypto.getRandomValues'}],
});

function hasBrowserCrypto(host) {
  return typeof host?.crypto?.getRandomValues === 'function';
}

function capabilityRefusal() {
  return {run: () => CRYPTO_REFUSAL,
    run_with_validator: () => CRYPTO_REFUSAL,
    run_with_control: () => CRYPTO_REFUSAL,
    engine_version: () => 'r1-structural-schema-spike/0.1.0'};
}

/** Check the browser capability before invoking generated wasm-bindgen init. */
export async function initializeWasm(loader, host = globalThis) {
  if (!hasBrowserCrypto(host)) return capabilityRefusal();
  const addon = await loader();
  return wrapWasm(addon, host);
}

export function wrapWasm(addon, host = globalThis) {
  if (!hasBrowserCrypto(host)) return capabilityRefusal();
  return {
    run: addon.run,
    run_with_validator: addon.run_with_validator,
    run_with_control: addon.run_with_control,
    engine_version: addon.engine_version,
  };
}

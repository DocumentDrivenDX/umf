// SPDX-License-Identifier: MIT OR Apache-2.0
/** Opt-in Rust-backed core evolution inspection and retained-operation verification. */
export function createCoreEvolutionOperations(invoke) {
  const call = (operation, args) => invoke(`model/${operation}`, args);
  return Object.freeze({
    inspectCoreEvolution(before, after, policy) {
      return call('inspectCoreEvolution', {before, after, policy});
    },
    verifyCoreEvolution(receipt, before, after, policy) {
      return call('verifyCoreEvolution', {receipt, before, after, policy});
    },
  });
}

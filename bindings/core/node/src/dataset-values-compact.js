// SPDX-License-Identifier: MIT OR Apache-2.0
/** Opt-in compact dataset value validation and receipt verification. */
export function createCompactDatasetValueOperations(invoke) {
  return Object.freeze({
    validateCoreDatasetValuesCompact(source, input) {
      return invoke('model/validateCoreDatasetValuesCompact', {source, input});
    },
    verifyCoreDatasetValuesCompact(receipt, current, expectedInput) {
      // Receipt admission precedes host traversal of current/expectedInput in
      // the public TypeScript verifier. This first call must stay receipt-only.
      const preparedReceipt = invoke('model/prepareCoreDatasetValuesCompactVerification', {receipt});
      return invoke('model/verifyCoreDatasetValuesCompact', {receipt: preparedReceipt, current, expectedInput});
    },
  });
}

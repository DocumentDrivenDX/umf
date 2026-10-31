// SPDX-License-Identifier: MIT OR Apache-2.0
/** Opt-in CONTRACT-053 source-token conversion over the shared Rust request route. */
export function createCsvBooleanLexicalOperations(invoke) {
  return Object.freeze({
    validateCsvBooleanLexical(source, request) {
      return invoke('model/validateCsvBooleanLexical', {source, csvRequest: request});
    },
    verifyCsvBooleanLexical(receipt, source, request) {
      // The first call must complete receipt byte/schema admission before the
      // host transport inspects expected source or request values. The finish
      // operation re-admits this data and recomputes in Rust; this first-phase
      // response is never trusted as a verification result.
      const preparedReceipt = invoke('model/prepareCsvBooleanLexicalVerification', {receipt});
      return invoke('model/finishCsvBooleanLexicalVerification', {preparedReceipt, source, csvRequest: request});
    },
  });
}

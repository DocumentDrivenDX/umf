// SPDX-License-Identifier: MIT OR Apache-2.0
/** Opt-in full dataset value validation and verification over the tagged wire. */
export function createDatasetValueOperations(invoke, {ErrorType = Error} = {}) {
  const call = (op, args) => {
    try {
      return invoke(op, args);
    } catch (error) {
      // The tagged transport adds an operation-argument prefix. The TypeScript
      // operation reports these two top-level admission errors at the root.
      // Do not strip paths for nested failures or for any other error code.
      const topLevel = (error?.code === 'CORE_DATASET_INPUT' && error?.path === '/input') ||
        (error?.code === 'CORE_DATASET_SOURCE' && error?.path === '/source');
      if (topLevel) throw new ErrorType(error.code, error.message, '');
      throw error;
    }
  };
  return Object.freeze({
    validateCoreDatasetValues(source, input) {
      return call('model/validateCoreDatasetValues', {source, input});
    },
    verifyCoreDatasetValues(receipt, current, expectedInput) {
      return call('model/verifyCoreDatasetValues', {receipt, current, expectedInput});
    },
  });
}

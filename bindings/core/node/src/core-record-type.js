// SPDX-License-Identifier: MIT OR Apache-2.0
/** Opt-in Core Record Type v6 authoring and staged Rust verification. */
export function createCoreRecordTypeOperations(invoke, nativeVerification, {ErrorType = Error} = {}) {
  const staged = new WeakMap();
  const outstanding = new Set();
  let disposed = false;
  const ensureActive = () => {
    if (disposed) throw new ErrorType('CORE_RECORD_TYPE_DISPOSED', 'Core Record Type engine has been disposed');
  };
  const api = {
    declareCoreRecordType(fieldAuthor, recordAuthor) {
      ensureActive();
      return invoke('model/declareCoreRecordType', {fieldAuthor, recordAuthor});
    },
    verifyCoreRecordTypeDeclaration(receipt, current) {
      ensureActive();
      return api.finishCoreRecordTypeVerification(api.prepareCoreRecordTypeVerification(receipt), current);
    },
    prepareCoreRecordTypeVerification(receipt) {
      ensureActive();
      if (outstanding.size >= 64) throw new ErrorType('CORE_RECORD_TYPE_STAGE_LIMIT', 'Outstanding Core Record Type verification stage limit exceeded');
      const stage = nativeVerification.prepare(receipt);
      const handle = Object.freeze(Object.create(null));
      staged.set(handle, stage);
      outstanding.add(handle);
      return handle;
    },
    finishCoreRecordTypeVerification(handle, current) {
      ensureActive();
      if (!handle || typeof handle !== 'object' || !staged.has(handle)) {
        throw new TypeError('Invalid private Core Record Type verification handle');
      }
      const stage = staged.get(handle);
      staged.delete(handle);
      outstanding.delete(handle);
      return nativeVerification.finish(stage, current);
    },
    discardCoreRecordTypeVerification(handle) {
      ensureActive();
      if (!handle || typeof handle !== 'object' || !staged.has(handle)) {
        throw new TypeError('Invalid private Core Record Type verification handle');
      }
      staged.delete(handle);
      outstanding.delete(handle);
    },
    dispose() {
      disposed = true;
      for (const handle of outstanding) staged.delete(handle);
      outstanding.clear();
      nativeVerification.dispose?.();
    },
  };
  return Object.freeze(api);
}

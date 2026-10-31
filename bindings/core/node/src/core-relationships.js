// SPDX-License-Identifier: MIT OR Apache-2.0
/** Opt-in Rust-backed core relationship operations over the shared request route. */
export function createCoreRelationshipOperations(invoke) {
  const call = (operation, fields) => invoke(`model/${operation}`, fields);
  const preparedReceipts = new WeakMap();
  return Object.freeze({
    selectCoreRelationships(source, query) {
      return call('selectCoreRelationships', {source, query});
    },
    inspectCoreRelationships(source, identity) {
      return call('inspectCoreRelationships', {source, identity});
    },
    lookupCoreRelationship(source, identity) {
      return call('lookupCoreRelationship', {source, identity});
    },
    declareCoreRelationship(source, identity, request) {
      return call('declareCoreRelationship', {source, identity, request});
    },
    verifyCoreRelationshipOperation(receipt, current) {
      return call('verifyCoreRelationshipOperation', {receipt, current});
    },
    admitCoreRelationshipLookupIdentity(identity) {
      return call('admitCoreRelationshipLookupIdentity', {identity});
    },
    admitCoreRelationshipRequest(request) {
      return call('admitCoreRelationshipRequest', {request});
    },
    prepareCoreRelationshipVerification(receipt) {
      const prepared = call('prepareCoreRelationshipVerification', {receipt});
      const handle = Object.freeze(Object.create(null));
      preparedReceipts.set(handle, prepared);
      return handle;
    },
    finishCoreRelationshipVerification(handle, current) {
      if (!handle || typeof handle !== 'object' || !preparedReceipts.has(handle)) {
        throw new TypeError('Invalid private relationship verification handle');
      }
      const prepared = preparedReceipts.get(handle);
      preparedReceipts.delete(handle);
      return call('finishCoreRelationshipVerification', {prepared, current});
    },
  });
}

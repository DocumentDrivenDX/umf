// SPDX-License-Identifier: MIT OR Apache-2.0
/** Opt-in core Key inspection, lookup, and authoring methods. */
export function createCoreKeysOperations(invoke, nativeVerification = undefined) {
  const call = (operation, fields) => invoke(`model/${operation}`, fields);
  const prepared = new WeakMap();
  const api = {
    inspectCoreKeys(source, identity) {
      return call('inspectCoreKeys', {source, identity});
    },
    lookupCoreKey(source, identity) {
      return call('lookupCoreKey', {source, identity});
    },
    declareCoreRecordMembers(source, identity, request) {
      return call('declareCoreRecordMembers', {source, identity, request});
    },
    declareCoreKey(source, identity, request) {
      return call('declareCoreKey', {source, identity, request});
    },
    verifyCoreKeyOperation(receipt, current) {
      return call('verifyCoreKeyOperation', {receipt, current});
    },
    admitCoreKeyIdentity(identity) {
      return call('admitCoreKeyIdentity', {identity});
    },
    admitCoreKeyRequest(request) {
      return call('admitCoreKeyRequest', {request});
    },
    admitCoreKeyMemberRequest(request) {
      return call('admitCoreKeyMemberRequest', {request});
    },
  };
  if (nativeVerification) {
    api.verifyCoreKeyOperation = (receipt, current) => {
      const handle = api.prepareCoreKeyVerification(receipt);
      return api.finishCoreKeyVerification(handle, current);
    };
    api.prepareCoreKeyVerification = receipt => {
      const handle = Object.freeze(Object.create(null));
      prepared.set(handle, nativeVerification.prepare(receipt));
      return handle;
    };
    api.finishCoreKeyVerification = (handle, current) => {
      if (!handle || typeof handle !== 'object' || !prepared.has(handle)) {
        throw new TypeError('Invalid private key verification handle');
      }
      const stage = prepared.get(handle);
      prepared.delete(handle);
      return nativeVerification.finish(stage, current);
    };
  }
  return Object.freeze(api);
}

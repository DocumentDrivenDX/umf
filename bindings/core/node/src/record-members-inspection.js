// SPDX-License-Identifier: MIT OR Apache-2.0
/** Opt-in retained Rust Core Record Members inspector. */
export function createCoreRecordMembersInspectionOperations(native, {ErrorType = Error} = {}) {
  let disposed = false;
  const ensureActive = () => {
    if (disposed) {
      throw new ErrorType('CORE_RECORD_MEMBERS_DISPOSED', 'Core Record Members engine has been disposed');
    }
  };
  return Object.freeze({
    inspectCoreRecordMembers(source, identity) {
      ensureActive();
      return native.inspect(source, identity);
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        native.dispose();
      }
    },
  });
}

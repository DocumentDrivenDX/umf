// SPDX-License-Identifier: MIT OR Apache-2.0
/** Opt-in Rust-backed core Key tuple methods over the shared request route. */
export function createCoreKeyTupleOperations(invoke, native = undefined) {
  const call = (operation, fields) => invoke(`model/${operation}`, fields);
  const freeze = (value) => {
    if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) freeze(value[key]);
      Object.freeze(value);
    }
    return value;
  };
  return Object.freeze({
    encodeCoreKeyTuple(source, identity, values, options) {
      if (native?.encode) return native.encode(source, identity, values, options);
      const fields = {source, identity, values};
      if (options !== undefined) fields.options = options;
      return call('encodeCoreKeyTuple', fields);
    },
    verifyCoreKeyTuple(receipt, current) {
      if (native?.verify) return native.verify(receipt, current);
      return call('verifyCoreKeyTuple', {receipt, current});
    },
    readCoreKeyTupleBytes(receipt, current) {
      if (native?.prepareRead) {
        const staged = native.prepareRead(receipt);
        return staged.readBytes(current);
      }
      if (native?.readBytes) return native.readBytes(receipt, current);
      return new Uint8Array(call('readCoreKeyTupleBytes', {receipt, current}));
    },
    prepareCoreKeyTuples(source) {
      if (native?.prepare) {
        const prepared = native.prepare(source);
        return Object.freeze({profile: 'umf.core.key-tuples.prepared/1', source: freeze(prepared.source),
          encode(identity, values) { return prepared.encode(identity, values); },
          verify(receipt) { return prepared.verify(receipt); }});
      }
      const retained = freeze(call('prepareCoreKeyTuples', {source}));
      return Object.freeze({
        profile: 'umf.core.key-tuples.prepared/1',
        source: retained,
        encode(identity, values) {
          return call('encodePreparedCoreKeyTuple', {source: retained, identity, values});
        },
        verify(receipt) {
          return call('verifyPreparedCoreKeyTuple', {source: retained, receipt});
        },
      });
    },
  });
}

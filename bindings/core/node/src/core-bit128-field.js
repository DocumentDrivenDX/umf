// SPDX-License-Identifier: MIT OR Apache-2.0

/**
 * Copy admission for the TypeScript `copyJson` boundary used by
 * declareCoreBit128Field. Keep the reflection order and refusal envelope in
 * sync with src/model/json.ts; this runs before values enter the Rust wire.
 */
export function copyCoreJsonInput(input, ErrorType = Error) {
  const active = new Set();
  let values = 0;
  const fail = (code, message, path) => { throw new ErrorType(code, message, path); };
  const escape = value => value.replaceAll('~', '~0').replaceAll('/', '~1');
  function visit(value, path, depth) {
    if (++values > 100_000 || depth > 128) fail('LIMIT', 'JSON structural limit exceeded', path);
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Object.is(value, -0) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
        fail('NUMBER', 'Number outside the core interoperable numeric profile', path);
      }
      return value;
    }
    if (typeof value !== 'object') fail('NON_JSON', 'Value is not JSON-compatible', path);
    if (active.has(value)) fail('CYCLE', 'Cyclic value', path);
    const proto = Object.getPrototypeOf(value);
    const array = Array.isArray(value);
    if (array ? proto !== Array.prototype : proto !== Object.prototype && proto !== null) {
      fail('NON_JSON', 'Custom object prototype', path);
    }
    if (Object.getOwnPropertySymbols(value).length) fail('NON_JSON', 'Symbol keys are not JSON-compatible', path);
    active.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = array ? [] : Object.create(null);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (array && key === 'length') continue;
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail('NON_JSON', 'Hidden fields and accessors cannot be serialized faithfully', `${path}/${escape(key)}`);
      }
      if (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= 0xffff_ffff || Number(key) >= value.length)) {
        fail('NON_JSON', 'Non-index array property', path);
      }
      Object.defineProperty(result, key, {
        value: visit(descriptor.value, `${path}/${escape(key)}`, depth + 1),
        enumerable: true, writable: true, configurable: true,
      });
    }
    if (array && Object.keys(value).length !== value.length) fail('NON_JSON', 'Sparse arrays are not JSON values', path);
    active.delete(value);
    return result;
  }
  return visit(input, '', 0);
}

/** Publicly separate opt-in operation surface; never merged into the default root. */
export function createCoreBit128FieldOperation(invoke) {
  return Object.freeze({declareCoreBit128Field(source, identity, scalarType) {
    return invoke(source, identity, scalarType);
  }});
}

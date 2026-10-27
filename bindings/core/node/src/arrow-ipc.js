export const ARROW_IPC_MAX_BYTES = 1_000_000;
export const ARROW_IPC_PROFILE = 'umf-r8-arrow-ipc/0.1.0';

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const typedArrayTag = Object.getOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag).get;
const typedArrayLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'length').get;
const typedArrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer').get;
const typedArrayByteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset').get;
const setBytes = Function.call.bind(Uint8Array.prototype.set);
const HEX = '0123456789abcdef';

function copyBytes(input) {
  let tag;
  try { tag = Reflect.apply(typedArrayTag, input, []); } catch { tag = undefined; }
  if (tag !== 'Uint8Array') throw new TypeError('Arrow IPC bytes must be a Uint8Array');
  const length = Reflect.apply(typedArrayLength, input, []);
  const view = new Uint8Array(Reflect.apply(typedArrayBuffer, input, []), Reflect.apply(typedArrayByteOffset, input, []), length);
  const copy = new Uint8Array(length);
  setBytes(copy, view);
  return copy;
}

function toHex(bytes) {
  let hex = '';
  for (let index = 0; index < bytes.length; index++) {
    const value = bytes[index];
    hex += HEX[value >>> 4] + HEX[value & 15];
  }
  return hex;
}

function fromHex(value) {
  if (typeof value !== 'string' || (value.length & 1) !== 0 || !/^[0-9a-f]*$/.test(value)) {
    throw new TypeError('Rust Arrow IPC export returned invalid lowercase hexadecimal bytes');
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

/** Build the public, copy-safe projection over the tagged-wire dispatcher. */
export function createArrowIpcOperations(call) {
  return Object.freeze({
    profile: ARROW_IPC_PROFILE,
    capabilities: Object.freeze({profile: ARROW_IPC_PROFILE, maxBytes: ARROW_IPC_MAX_BYTES, exactSource: true, complete: false}),
    captureArrowIpc(bytes, options) {
      const owned = copyBytes(bytes);
      const id = options?.id;
      if (typeof id !== 'string') throw new TypeError('Arrow IPC capture id must be a string');
      return call('capture', {bytes: toHex(owned), id});
    },
    exportArrowIpcCapture(document) {
      return copyBytes(fromHex(call('export', {document})));
    },
    inspectArrowIpcCapture(document) {
      return call('inspect', {document});
    },
  });
}

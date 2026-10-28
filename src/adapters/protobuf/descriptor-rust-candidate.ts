// SPDX-License-Identifier: MIT OR Apache-2.0
import { UmfError } from '../../model/errors';
import type { DescriptorNode } from './descriptor';

/** Build the opt-in Rust-backed descriptor reader without changing the default adapter. */
export function createReadDescriptorSetRustCandidate(
  engine: { readDescriptorSet(binary: Uint8Array): unknown },
  isNativeUmfCoreError: (error: unknown) => boolean,
): (binary: Uint8Array) => DescriptorNode {
  return function readDescriptorSetRustCandidate(binary: Uint8Array): DescriptorNode {
    // Match the TypeScript predecessor's size-check precedence. In particular,
    // the property read is before the parser catch and the LIMIT message is stable.
    if (binary.length > 4_000_000) {
      throw new UmfError('LIMIT', 'Descriptor input exceeds limit');
    }
    try {
      // The bounded host profile includes Uint8Array-family views and empty
      // DataView. Other view forms are rejected by snapshotViewBytes rather
      // than being reinterpreted by the Rust binding.
      if (!ArrayBuffer.isView(binary)) {
        throw new TypeError('Expected ArrayBuffer for the first argument.');
      }
      const bytes = snapshotViewBytes(binary);
      return engine.readDescriptorSet(bytes) as DescriptorNode;
    } catch (error) {
      if (isNativeUmfCoreError(error)) {
        const native = error as {code: string; message: string; path?: string};
        throw new UmfError(native.code, native.message, native.path ?? '');
      }
      throw new UmfError('PROTOBUF_BINARY', String(error));
    }
  };
}

function snapshotViewBytes(view: ArrayBufferView): Uint8Array {
  const dataViewPrototype = DataView.prototype;
  const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
  let getters = dataViewPrototype;
  try {
    Object.getOwnPropertyDescriptor(dataViewPrototype, 'byteLength')!.get!.call(view);
  } catch {
    getters = typedArrayPrototype;
  }
  const get = (key: 'buffer' | 'byteOffset' | 'byteLength') =>
    Object.getOwnPropertyDescriptor(getters, key)!.get!.call(view);
  const byteLength = get('byteLength') as number;
  if (getters === dataViewPrototype) {
    if (byteLength !== 0) throw new TypeError('Non-empty DataView admission is outside the candidate profile');
    return new Uint8Array();
  }
  if (!(view instanceof Uint8Array)) throw new TypeError('Non-Uint8 typed-array admission is outside the candidate profile');
  const buffer = get('buffer') as ArrayBuffer;
  const byteOffset = get('byteOffset') as number;
  return new Uint8Array(buffer, byteOffset, byteLength).slice();
}

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
      return engine.readDescriptorSet(binary) as DescriptorNode;
    } catch (error) {
      if (isNativeUmfCoreError(error)) {
        const native = error as {code: string; message: string; path?: string};
        throw new UmfError(native.code, native.message, native.path ?? '');
      }
      throw new UmfError('PROTOBUF_BINARY', String(error));
    }
  };
}

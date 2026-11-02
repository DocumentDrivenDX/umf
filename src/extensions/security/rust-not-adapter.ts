// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/types';
import type {SecurityTruth} from './logic';

export interface RustSecurityNotExecutor {
  securityNot(value: SecurityTruth): SecurityTruth;
}

/**
 * Preserve the predecessor's scalar admission before calling Rust. This guard
 * performs no object reflection; the NOT truth decision remains Rust-owned.
 */
export function createSecurityNotRustAdapter(executor: RustSecurityNotExecutor): (value: unknown) => SecurityTruth {
  const rustSecurityNot = executor.securityNot;
  if (typeof rustSecurityNot !== 'function') throw new TypeError('Rust securityNot operation is unavailable');
  return (value: unknown) => {
    if (value !== 'T' && value !== 'F' && value !== 'U') {
      throw new UmfError('SECURITY_TRUTH', 'Invalid security truth');
    }
    return rustSecurityNot.call(executor, value);
  };
}

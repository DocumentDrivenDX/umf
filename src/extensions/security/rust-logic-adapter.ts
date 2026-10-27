// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../../model/json';
import {UmfError} from '../../model/types';
import type {SecurityTruth} from './logic';

export interface RustSecurityLogicExecutor {
  securityAnd(values: readonly SecurityTruth[]): SecurityTruth;
  securityOr(values: readonly SecurityTruth[]): SecurityTruth;
}

const truth = (value: unknown): SecurityTruth => {
  if (value !== 'T' && value !== 'F' && value !== 'U') {
    throw new UmfError('SECURITY_TRUTH', 'Invalid security truth');
  }
  return value;
};

function truthArguments(values: unknown): SecurityTruth[] {
  // Preserve the predecessor order: snapshot the complete input before bounds
  // or truth-token checks. This also rejects accessors without invoking them.
  const copied = copyJson(values);
  if (!Array.isArray(copied) || copied.length === 0 || copied.length > 64) {
    throw new UmfError('SECURITY_BOUND', 'Expected 1–64 truth operands');
  }
  return copied.map(truth);
}

/** Preserve TypeScript raw-input admission while delegating valid folds to Rust. */
export function createSecurityLogicRustAdapter(executor: RustSecurityLogicExecutor): {
  securityAnd(values: unknown): SecurityTruth;
  securityOr(values: unknown): SecurityTruth;
} {
  const rustAnd = executor.securityAnd;
  const rustOr = executor.securityOr;
  if (typeof rustAnd !== 'function' || typeof rustOr !== 'function') {
    throw new TypeError('Rust security And/Or operations are unavailable');
  }
  return {
    securityAnd(values) {
      return rustAnd.call(executor, truthArguments(values));
    },
    securityOr(values) {
      return rustOr.call(executor, truthArguments(values));
    },
  };
}

// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../../model/errors';
import type {SecurityProtectionSourceResolution} from './references';
import type {ProtectionParameterValidation} from './parameters';
import type {SecurityProtectionDomainResolution} from './domains';

export interface SecurityProtectionSourceEngine {
  resolveSecurityProtectionSources(policy: unknown, catalog: unknown): unknown;
}
export interface SecurityProtectionParametersEngine {
  validateProtectionParameters(policy: unknown, catalog: unknown, closure: unknown): unknown;
}
export interface SecurityProtectionDomainsEngine {
  resolveSecurityProtectionDomains(policy: unknown, catalog: unknown, closure: unknown): unknown;
}

function freezeReport(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeReport(child);
    Object.freeze(value);
  }
  return value;
}

/** Route the public source and parameter reports through their Rust kernels. */
export function createProtectionSourcesRustDefault(
  engine: SecurityProtectionSourceEngine & SecurityProtectionParametersEngine & SecurityProtectionDomainsEngine,
  isNativeError: (error: unknown) => boolean,
) {
  const call = <T>(operation: () => unknown): T => {
    try { return freezeReport(operation()) as T; }
    catch (error) {
      if (!isNativeError(error)) throw error;
      const native = error as {code?: unknown; message?: unknown; path?: unknown};
      if (typeof native.code === 'string' && (native.code.startsWith('PROTECTION_') || native.code.startsWith('SECURITY_PROTECTION_') || native.code === 'REQUEST')) {
        throw new UmfError(native.code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : '');
      }
      throw error;
    }
  };
  return Object.freeze({
    resolveSecurityProtectionSources(policy: unknown, catalog: unknown): SecurityProtectionSourceResolution {
      return call(() => engine.resolveSecurityProtectionSources(policy, catalog));
    },
    validateProtectionParameters(policy: unknown, catalog: unknown, closure: unknown): ProtectionParameterValidation {
      return call(() => engine.validateProtectionParameters(policy, catalog, closure));
    },
    resolveSecurityProtectionDomains(policy: unknown, catalog: unknown, closure: unknown): SecurityProtectionDomainResolution {
      return call(() => engine.resolveSecurityProtectionDomains(policy, catalog, closure));
    },
  });
}

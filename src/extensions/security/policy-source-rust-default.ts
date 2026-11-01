// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';

export interface SecurityPolicySourceEngine {
  inspectSecurityPolicyV2Source(source: unknown): unknown;
  upgradeSecurityPolicySource(source: unknown, revision: unknown): unknown;
  downgradeSecurityPolicySource(source: unknown, revision: unknown): unknown;
  readSecuritySource(source: string, format?: 'json'|'yaml'): unknown;
  writeSecuritySource(value: unknown, format?: 'json'|'yaml'): string;
}

function freezeReport(value: unknown): unknown {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeReport(child);
    Object.freeze(value);
  }
  return value;
}

export function createSecurityPolicySourceRustDefault(engine: SecurityPolicySourceEngine, isNativeError: (error: unknown) => boolean) {
  const call = <T>(operation: () => unknown): T => {
    try { return freezeReport(operation()) as T; }
    catch (error) {
      if (!isNativeError(error)) throw error;
      const native = error as {code?: unknown; message?: unknown; path?: unknown};
      if (typeof native.code === 'string' && (native.code.startsWith('SECURITY_') || native.code.startsWith('LIMIT') || native.code === 'REQUEST')) {
        throw new UmfError(native.code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : '');
      }
      throw error;
    }
  };
  return Object.freeze({
    inspectSecurityPolicyV2Source(source: unknown): unknown { return call(() => engine.inspectSecurityPolicyV2Source(source)); },
    upgradeSecurityPolicySource(source: unknown, revision: unknown): unknown { return call(() => engine.upgradeSecurityPolicySource(source, revision)); },
    downgradeSecurityPolicySource(source: unknown, revision: unknown): unknown { return call(() => engine.downgradeSecurityPolicySource(source, revision)); },
    readSecuritySource(source: string, format: 'json'|'yaml' = 'json'): unknown { return call(() => engine.readSecuritySource(source, format)); },
    writeSecuritySource(value: unknown, format: 'json'|'yaml' = 'json'): string { return call(() => engine.writeSecuritySource(value, format)); },
  });
}

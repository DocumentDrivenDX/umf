// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {SecurityPolicy,SecurityResolution} from './types';
import type {SecurityDisclosureBatch} from './disclosure';
import type {SecurityDisclosureBatchV2,SecurityDisclosureInspectionV2} from './protection/disclosure';

export interface SecurityPolicySourceEngine {
  inspectSecurityActionPurposes(ontology: unknown, documents: unknown): unknown;
  inspectProtectionObligations(policy: unknown, catalog: unknown, closure: unknown, ontology: unknown): unknown;
  validateSecurityDisclosure(batch: unknown, policy: SecurityPolicy, resolution: SecurityResolution): unknown;
  encodeSecurityDisclosure(batch: unknown, policy: SecurityPolicy, resolution: SecurityResolution): string;
  decodeSecurityDisclosure(source: string, policy: SecurityPolicy, resolution: SecurityResolution): unknown;
  inspectSecurityDisclosureV2(source: unknown, policy: unknown, catalog: unknown, closure: unknown): unknown;
  encodeSecurityDisclosureV2(source: unknown, policy: unknown, catalog: unknown, closure: unknown, format: 'json'|'yaml'): string;
  decodeSecurityDisclosureV2(source: string, policy: unknown, catalog: unknown, closure: unknown, format: 'json'|'yaml'): unknown;
  evaluateSecurityAccess(policy: unknown, resolution: unknown, cut: unknown, request: unknown, resource: unknown): unknown;
  evaluateSecurityCollection(policy: unknown, resolution: unknown, cut: unknown, request: unknown): unknown;
  evaluateSecurityWrite(policy: unknown, resolution: unknown, writeProfile: unknown, request: unknown): unknown;
  evaluateSecurityPolicyV2LegacyAccess(source: unknown, resolution: unknown, cut: unknown, request: unknown, resource: unknown): unknown;
  inspectSecurityPolicyV2Source(source: unknown): unknown;
  inspectSecurityPolicy(source: unknown, resolution?: unknown): unknown;
  requireSecurityInterpretation(source: unknown, resolution: unknown): unknown;
  securityPolicyDependencies(source: unknown, resolution: unknown): unknown;
  securityIdentityTransportDependencies(source: unknown, resolution: unknown): unknown;
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
    inspectSecurityActionPurposes(ontology: unknown, documents: unknown): ReturnType<typeof import('./action-purposes').inspectSecurityActionPurposes> { return call(() => engine.inspectSecurityActionPurposes(ontology,documents)); },
    inspectProtectionObligations(policy: unknown, catalog: unknown, closure: unknown, ontology: unknown): ReturnType<typeof import('./protection/obligations').inspectProtectionObligations> { return call(() => engine.inspectProtectionObligations(policy,catalog,closure,ontology)); },
    validateSecurityDisclosure(batch: unknown, policy: SecurityPolicy, resolution: SecurityResolution): SecurityDisclosureBatch { return call(() => engine.validateSecurityDisclosure(batch,policy,resolution)) as SecurityDisclosureBatch; },
    encodeSecurityDisclosure(batch: unknown, policy: SecurityPolicy, resolution: SecurityResolution): string { return call(() => engine.encodeSecurityDisclosure(batch,policy,resolution)) as string; },
    decodeSecurityDisclosure(source: string, policy: SecurityPolicy, resolution: SecurityResolution): SecurityDisclosureBatch { return call(() => engine.decodeSecurityDisclosure(source,policy,resolution)) as SecurityDisclosureBatch; },
    inspectSecurityDisclosureV2(source: unknown, policy: unknown, catalog: unknown, closure: unknown): SecurityDisclosureInspectionV2 { return call(() => engine.inspectSecurityDisclosureV2(source,policy,catalog,closure)); },
    encodeSecurityDisclosureV2(source: unknown, policy: unknown, catalog: unknown, closure: unknown, format: 'json'|'yaml' = 'json'): string { return call(() => engine.encodeSecurityDisclosureV2(source,policy,catalog,closure,format)) as string; },
    decodeSecurityDisclosureV2(source: string, policy: unknown, catalog: unknown, closure: unknown, format: 'json'|'yaml' = 'json'): SecurityDisclosureBatchV2 { return call(() => engine.decodeSecurityDisclosureV2(source,policy,catalog,closure,format)); },
    evaluateSecurityAccess(policy: unknown, resolution: unknown, cut: unknown, request: unknown, resource: unknown): unknown { return call(() => engine.evaluateSecurityAccess(policy,resolution,cut,request,resource)); },
    evaluateSecurityCollection(policy: unknown, resolution: unknown, cut: unknown, request: unknown): unknown { return call(() => engine.evaluateSecurityCollection(policy,resolution,cut,request)); },
    evaluateSecurityWrite(policy: unknown, resolution: unknown, writeProfile: unknown, request: unknown): unknown { return call(() => engine.evaluateSecurityWrite(policy,resolution,writeProfile,request)); },
    evaluateSecurityPolicyV2LegacyAccess(source: unknown, resolution: unknown, cut: unknown, request: unknown, resource: unknown): unknown { return call(() => engine.evaluateSecurityPolicyV2LegacyAccess(source,resolution,cut,request,resource)); },
    inspectSecurityPolicyV2Source(source: unknown): unknown { return call(() => engine.inspectSecurityPolicyV2Source(source)); },
    inspectSecurityPolicy(source: unknown, resolution?: unknown): unknown { return call(() => engine.inspectSecurityPolicy(source,resolution)); },
    requireSecurityInterpretation(source: unknown, resolution: unknown): unknown { return call(() => engine.requireSecurityInterpretation(source,resolution)); },
    securityPolicyDependencies(source: unknown, resolution: unknown): unknown { return call(() => engine.securityPolicyDependencies(source,resolution)); },
    securityIdentityTransportDependencies(source: unknown, resolution: unknown): unknown { return call(() => engine.securityIdentityTransportDependencies(source,resolution)); },
    upgradeSecurityPolicySource(source: unknown, revision: unknown): unknown { return call(() => engine.upgradeSecurityPolicySource(source, revision)); },
    downgradeSecurityPolicySource(source: unknown, revision: unknown): unknown { return call(() => engine.downgradeSecurityPolicySource(source, revision)); },
    readSecuritySource(source: string, format: 'json'|'yaml' = 'json'): unknown { return call(() => engine.readSecuritySource(source, format)); },
    writeSecuritySource(value: unknown, format: 'json'|'yaml' = 'json'): string { return call(() => engine.writeSecuritySource(value, format)); },
  });
}

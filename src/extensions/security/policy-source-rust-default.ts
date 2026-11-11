// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {SecurityPolicy,SecurityResolution} from './types';
import type {SecurityDisclosureBatch} from './disclosure';
import type {SecurityDisclosureBatchV2,SecurityDisclosureInspectionV2} from './protection/disclosure';
import type {SecurityAccessResult,SecurityCollectionResult} from './evaluate';
import type {SecurityWriteResult} from './write';
import type {SecurityPolicyV2LegacyAccess} from './policy-v2-legacy-access';
import type {SecurityPolicyV2Inspection,SecurityPolicySourceMigration} from './policy-representation-v2';
import type {SecurityInspection} from './policy';
import type {SecurityDependencies,SecurityIdentityTransportDependencies} from './dependencies';
import type {Json} from '../../model/types';

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
  inspectSecurityPolicyPayload(payload: unknown, path: string): unknown;
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
    evaluateSecurityAccess(policy: unknown, resolution: unknown, cut: unknown, request: unknown, resource: unknown): SecurityAccessResult { return call<SecurityAccessResult>(() => engine.evaluateSecurityAccess(policy,resolution,cut,request,resource)); },
    evaluateSecurityCollection(policy: unknown, resolution: unknown, cut: unknown, request: unknown): SecurityCollectionResult { return call<SecurityCollectionResult>(() => engine.evaluateSecurityCollection(policy,resolution,cut,request)); },
    evaluateSecurityWrite(policy: unknown, resolution: unknown, writeProfile: unknown, request: unknown): SecurityWriteResult { return call<SecurityWriteResult>(() => engine.evaluateSecurityWrite(policy,resolution,writeProfile,request)); },
    evaluateSecurityPolicyV2LegacyAccess(source: unknown, resolution: unknown, cut: unknown, request: unknown, resource: unknown): SecurityPolicyV2LegacyAccess { return call<SecurityPolicyV2LegacyAccess>(() => engine.evaluateSecurityPolicyV2LegacyAccess(source,resolution,cut,request,resource)); },
    inspectSecurityPolicyV2Source(source: unknown): SecurityPolicyV2Inspection { return call<SecurityPolicyV2Inspection>(() => engine.inspectSecurityPolicyV2Source(source)); },
    inspectSecurityPolicy(source: unknown, resolution?: unknown): SecurityInspection { return call<SecurityInspection>(() => engine.inspectSecurityPolicy(source,resolution)); },
    inspectSecurityPolicyPayload(payload: unknown, path: string): unknown { return call(() => engine.inspectSecurityPolicyPayload(payload,path)); },
    requireSecurityInterpretation(source: unknown, resolution: unknown): SecurityInspection { return call<SecurityInspection>(() => engine.requireSecurityInterpretation(source,resolution)); },
    securityPolicyDependencies(source: unknown, resolution: unknown): SecurityDependencies { return call<SecurityDependencies>(() => engine.securityPolicyDependencies(source,resolution)); },
    securityIdentityTransportDependencies(source: unknown, resolution: unknown): SecurityIdentityTransportDependencies { return call<SecurityIdentityTransportDependencies>(() => engine.securityIdentityTransportDependencies(source,resolution)); },
    upgradeSecurityPolicySource(source: unknown, revision: unknown): SecurityPolicySourceMigration { return call<SecurityPolicySourceMigration>(() => engine.upgradeSecurityPolicySource(source, revision)); },
    downgradeSecurityPolicySource(source: unknown, revision: unknown): SecurityPolicySourceMigration { return call<SecurityPolicySourceMigration>(() => engine.downgradeSecurityPolicySource(source, revision)); },
    readSecuritySource(source: string, format: 'json'|'yaml' = 'json'): Json { return call<Json>(() => engine.readSecuritySource(source, format)); },
    writeSecuritySource(value: unknown, format: 'json'|'yaml' = 'json'): string { return call(() => engine.writeSecuritySource(value, format)); },
  });
}

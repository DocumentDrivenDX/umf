// SPDX-License-Identifier: MIT OR Apache-2.0
/** Rust-owned semantic callbacks for built-in extension registries. */
import {UmfError} from '../model/errors';
import {canonicalSchemaJson} from '../model/schema-literals';
import type {Diagnostic, ExtensionPackage} from '../model/types';
import type {Registry as RegistryInstance, SemanticValidator} from './registry';
import {composeOwnedSemanticValidator} from './semantic-owner';
import {securityPackage} from '../extensions/security/policy-package';
import {semanticTypesPackage} from '../extensions/semantic-types/package';
import {tableLifecyclePackage} from '../extensions/tables/package';

interface PayloadContext {
  document: unknown;
  path: string;
  scope: string;
}
interface SecurityPayloadEngine {
  inspectSecurityPolicyPayload(payload: unknown, path: string): unknown;
}
interface SemanticTypesPayloadEngine {
  inspectSemanticTypePayload(payload: unknown, path: string): unknown;
}
interface TablePayloadEngine {
  inspectTableLifecyclePayload(payload: unknown, context: PayloadContext): unknown;
}

const CONTROL_CODES = new Set([
  'RESOURCE_LIMIT', 'CANCELLED', 'METER_FAILURE', 'CANCELLATION_CHECK_FAILURE',
  'CLOCK_CAPABILITY_REQUIRED', 'DEADLINE', 'DEADLINE_EXCEEDED', 'LIMIT', 'CAPACITY',
]);
type NativeError = {code?: unknown; message?: unknown; path?: unknown};

function diagnostics(result: unknown): Diagnostic[] {
  if (!Array.isArray(result)) throw new UmfError('EXTENSION_KIND_RUNTIME_REQUIRED', 'Rust semantic callback returned a non-array diagnostic report');
  return result as Diagnostic[];
}

export function createExtensionRegistriesRustDefault(
  createRegistry: () => RegistryInstance,
  security: SecurityPayloadEngine,
  semanticTypes: SemanticTypesPayloadEngine,
  tables: TablePayloadEngine,
  isNativeError: (error: unknown) => boolean,
) {
  const call = <T>(operation: () => T): T => {
    try { return operation(); }
    catch (error) {
      if (!isNativeError(error)) throw error;
      const native = error as NativeError;
      if (typeof native.code !== 'string' || CONTROL_CODES.has(native.code)) throw error;
      throw new UmfError(native.code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : '');
    }
  };
  const securityMeaning: SemanticValidator = (payload, context) => diagnostics(call(() => security.inspectSecurityPolicyPayload(payload, context.path)));
  const semanticTypeMeaning: SemanticValidator = (payload, context) => diagnostics(call(() => semanticTypes.inspectSemanticTypePayload(payload, context.path)));
  const tableMeaning: SemanticValidator = (payload, context) => diagnostics(call(() => tables.inspectTableLifecyclePayload(payload, context)));

  function register(registry: RegistryInstance, manifest: ExtensionPackage, meaning: SemanticValidator): RegistryInstance {
    const existing = registry.get(manifest.id, manifest.version);
    if (existing && canonicalSchemaJson(existing.manifest) !== canonicalSchemaJson(manifest)) {
      throw new UmfError('DUPLICATE_VERSION', 'Existing extension registration differs from the distributed package');
    }
    const owner = {id: manifest.id, version: manifest.version};
    return registry.register(manifest, composeOwnedSemanticValidator(owner, meaning), {replaceActions: true});
  }

  return Object.freeze({
    securityRegistry(registry: RegistryInstance = createRegistry()): RegistryInstance {
      return register(registry, securityPackage, securityMeaning);
    },
    semanticTypesRegistry(registry: RegistryInstance = createRegistry()): RegistryInstance {
      return register(registry, semanticTypesPackage, semanticTypeMeaning);
    },
    tableLifecycleRegistry(registry: RegistryInstance = createRegistry()): RegistryInstance {
      return register(registry, tableLifecyclePackage, tableMeaning);
    },
  });
}

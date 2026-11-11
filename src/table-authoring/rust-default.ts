// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/errors';
import {copyJson} from '../model/json';
import type {RowScopeBindingContext,RowScopeResult} from './row-scope-types';

type Result = RowScopeResult;
export interface NativeRowScopeEngine {
  prepareRowScope(input: unknown, context: unknown): unknown;
  completeRowScope(input: unknown, context: unknown, prepared: unknown, admitPolicyDiagnostics: unknown): unknown;
}
const CONTROL_CODES = new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

/** Rust owns candidate mapping and native admission; the caller callback only contributes bounded diagnostics. */
export function createRowScopeRustDefault(
  createEngine: () => NativeRowScopeEngine,
  isNativeError: (error: unknown) => boolean,
) {
  let engine: NativeRowScopeEngine | undefined;
  const getEngine = () => engine ??= createEngine();
  const nativeCall = <T>(callback: (engine: NativeRowScopeEngine) => unknown): T => {
    try { return callback(getEngine()) as T; }
    catch (error) {
      if (!isNativeError(error)) throw error;
      const native = error as {code?: unknown; message?: unknown; path?: unknown; pointer?: unknown};
      if (typeof native.code !== 'string' || CONTROL_CODES.has(native.code)) throw error;
      throw new UmfError(native.code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : typeof native.pointer === 'string' ? native.pointer : '');
    }
  };
  return function normalize(input: unknown, context: RowScopeBindingContext): Result {
    // Keep the executable callback on the host side; tagged wire only carries
    // the declarative binding/context values consumed by the native kernel.
    const {
      admitPolicy, groups, openReferenceRead, lifecycleDocument, tableId, deploymentConfiguration, ...bindings
    } = context;
    const transportContext = {
      ...bindings,
      ...(groups === undefined ? {} : {groups}),
      ...(openReferenceRead === undefined ? {} : {openReferenceRead}),
      ...(lifecycleDocument === undefined ? {} : {lifecycleDocument}),
      ...(tableId === undefined ? {} : {tableId}),
      ...(deploymentConfiguration === undefined ? {} : {deploymentConfiguration}),
    };
    const prepared = nativeCall<unknown>(engine => engine.prepareRowScope(input, transportContext));
    if (!prepared || typeof prepared !== 'object' || Array.isArray(prepared)) throw new Error('Native row-scope preparation returned an invalid result');
    const candidate = prepared as Result;
    if (!candidate.valid || !candidate.policy) return candidate;
    // This is deliberately outside the native call/session boundary. Host
    // exceptions retain their original identity and do not mutate Rust state.
    const diagnostics = admitPolicy(copyJson(candidate.policy) as unknown as NonNullable<Result['policy']>);
    return nativeCall<Result>(engine => engine.completeRowScope(input, transportContext, prepared, diagnostics));
  };
}

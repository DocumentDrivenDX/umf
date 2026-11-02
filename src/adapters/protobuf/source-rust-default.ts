// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {
  ProtobufSourceCompiler,
  ProtobufSourceEmitter,
  ProtobufSourceRequest,
  importProtobufSources as importProtobufSourcesType,
  exportProtobufSources as exportProtobufSourcesType,
} from './source';

type NativeErrorGuard = (error: unknown) => boolean;
export interface ProtobufSourceImportNativeEngine {
  importProtobufSources(input: ProtobufSourceRequest, compiler: ProtobufSourceCompiler, options: {id: string}): Promise<unknown>;
}
export interface ProtobufSourceExportNativeEngine {
  exportProtobufSources(document: unknown, emitter: ProtobufSourceEmitter): Promise<unknown>;
}

const CONTROL_CODES = new Set([
  'RESOURCE_LIMIT', 'CANCELLED', 'METER_FAILURE', 'CANCELLATION_CHECK_FAILURE',
  'CLOCK_CAPABILITY_REQUIRED', 'DEADLINE', 'DEADLINE_EXCEEDED',
]);

function nativeFailure(error: unknown, isNative: NativeErrorGuard): never {
  if (!isNative(error)) throw error;
  const native = error as {code?: unknown; message?: unknown; path?: unknown};
  if (typeof native.code !== 'string' || CONTROL_CODES.has(native.code)) throw error;
  if (!native.code.startsWith('PROTOBUF_') && native.code !== 'REQUEST' && native.code !== 'JSON_SCHEMA_SYNTAX') throw error;
  throw new UmfError(native.code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : '');
}

/** Preserve Promise API and callback exception identity while routing source work through Rust. */
export function createProtobufSourceRustDefault(
  importEngine: ProtobufSourceImportNativeEngine,
  exportEngine: ProtobufSourceExportNativeEngine,
  isNativeUmfCoreError: NativeErrorGuard = () => false,
) {
  return Object.freeze({
    async importProtobufSources(
      input: Parameters<typeof importProtobufSourcesType>[0],
      compiler: ProtobufSourceCompiler,
      options: Parameters<typeof importProtobufSourcesType>[2],
    ): ReturnType<typeof importProtobufSourcesType> {
      let callbackFailure: unknown;
      const trackedCompiler: ProtobufSourceCompiler = {
        async compile(request) {
          try {
            return await compiler.compile(request);
          } catch (error) {
            callbackFailure = error;
            throw error;
          }
        },
      };
      try {
        return await importEngine.importProtobufSources(input, trackedCompiler, options) as Awaited<ReturnType<typeof importProtobufSourcesType>>;
      } catch (error) {
        if (error === callbackFailure) throw error;
        return nativeFailure(error, isNativeUmfCoreError);
      }
    },
    async exportProtobufSources(
      document: Parameters<typeof exportProtobufSourcesType>[0],
      emitter: ProtobufSourceEmitter,
    ): ReturnType<typeof exportProtobufSourcesType> {
      let callbackFailure: unknown;
      const trackedEmitter: ProtobufSourceEmitter = {
        async emit(descriptorSet) {
          try {
            return await emitter.emit(descriptorSet);
          } catch (error) {
            callbackFailure = error;
            throw error;
          }
        },
      };
      try {
        return await exportEngine.exportProtobufSources(document, trackedEmitter) as Awaited<ReturnType<typeof exportProtobufSourcesType>>;
      } catch (error) {
        if (error === callbackFailure) throw error;
        return nativeFailure(error, isNativeUmfCoreError);
      }
    },
  });
}

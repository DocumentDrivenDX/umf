// SPDX-License-Identifier: MIT OR Apache-2.0
import type {
  exportIcebergSchema,
  getIcebergNode,
  importIcebergSchema,
  inspectIceberg,
  proposeIcebergNodeEdit,
} from './index';
import type {Diagnostic, Document, ExtensionPackage, Json, Validation} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import {ICEBERG_EXTENSION, icebergPackage} from './package';

type NativeErrorGuard = (error: unknown) => boolean;

export interface IcebergSchemaNativeEngine {
  importSchema(source: string, id: string): unknown;
  exportSchema(document: Document): unknown;
  inspect(document: Document): unknown;
  inspectPayload(payload: Json): unknown;
  getNode(document: Document, pointer: string): unknown;
  proposeNodeEdit(document: Document, pointer: string, replacementJson: string): unknown;
}

const CONTROL_CODES = new Set([
  'RESOURCE_LIMIT', 'CANCELLED', 'METER_FAILURE', 'CANCELLATION_CHECK_FAILURE',
  'CLOCK_CAPABILITY_REQUIRED', 'DEADLINE', 'DEADLINE_EXCEEDED',
]);

/** Preserve the current synchronous Iceberg schema API over the Rust schema engine. */
export function createIcebergSchemaRustDefault(
  engine: IcebergSchemaNativeEngine,
  isNativeError: NativeErrorGuard = () => false,
  createRegistry: () => Registry = () => new Registry(),
) {
  const call = <T>(operation: () => unknown): T => {
    try {
      return operation() as T;
    } catch (error) {
      if (!isNativeError(error)) throw error;
      const native = error as {code?: unknown; message?: unknown; path?: unknown};
      if (typeof native.code !== 'string' || CONTROL_CODES.has(native.code)) throw error;
      const code = native.code;
      if (code === 'REQUEST' || code === 'JSON_SCHEMA_SYNTAX' || code.startsWith('ICEBERG_')) {
        throw new UmfError(code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : '');
      }
      throw error;
    }
  };
  const inspectPayload = (payload: Json): Diagnostic[] =>
    call<Diagnostic[]>(() => engine.inspectPayload(payload));

  return Object.freeze({
    icebergRegistry(): Registry {
      return createRegistry().register(icebergPackage as unknown as ExtensionPackage, inspectPayload);
    },
    inspectIceberg(document: Parameters<typeof inspectIceberg>[0]): ReturnType<typeof inspectIceberg> {
      return call<ReturnType<typeof inspectIceberg>>(() => engine.inspect(document));
    },
    importIcebergSchema(
      text: Parameters<typeof importIcebergSchema>[0],
      options: Parameters<typeof importIcebergSchema>[1],
    ): ReturnType<typeof importIcebergSchema> {
      return call<ReturnType<typeof importIcebergSchema>>(() => engine.importSchema(text, options.id));
    },
    exportIcebergSchema(document: Parameters<typeof exportIcebergSchema>[0]): ReturnType<typeof exportIcebergSchema> {
      return call<ReturnType<typeof exportIcebergSchema>>(() => engine.exportSchema(document));
    },
    getIcebergNode(
      document: Parameters<typeof getIcebergNode>[0],
      pointer: Parameters<typeof getIcebergNode>[1],
    ): ReturnType<typeof getIcebergNode> {
      return call<NativeJson>(() => engine.getNode(document, pointer)) as ReturnType<typeof getIcebergNode>;
    },
    proposeIcebergNodeEdit(
      document: Parameters<typeof proposeIcebergNodeEdit>[0],
      pointer: Parameters<typeof proposeIcebergNodeEdit>[1],
      replacementJson: Parameters<typeof proposeIcebergNodeEdit>[2],
    ): ReturnType<typeof proposeIcebergNodeEdit> {
      return call<ReturnType<typeof proposeIcebergNodeEdit>>(() => engine.proposeNodeEdit(document, pointer, replacementJson));
    },
  });
}

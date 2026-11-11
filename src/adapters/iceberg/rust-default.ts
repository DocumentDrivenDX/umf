// SPDX-License-Identifier: MIT OR Apache-2.0

import type {Diagnostic, Document, ExtensionPackage, Json, Validation} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import type {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import {ICEBERG_EXTENSION, icebergPackage} from './package';

type ExportIcebergSchema = (document: Document) => string;
type GetIcebergNode = (document: Document, path: string) => NativeJson;
type ImportIcebergSchema = (text: string, options: { id: string; }) => Document;
type InspectIceberg = (document: Document) => Validation;
type ProposeIcebergNodeEdit = (document: Document, path: string, text: string) => { document: Document; validation: Validation; };

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
  createRegistry: () => Registry,
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
    inspectIceberg(document: Parameters<InspectIceberg>[0]): ReturnType<InspectIceberg> {
      return call<ReturnType<InspectIceberg>>(() => engine.inspect(document));
    },
    importIcebergSchema(
      text: Parameters<ImportIcebergSchema>[0],
      options: Parameters<ImportIcebergSchema>[1],
    ): ReturnType<ImportIcebergSchema> {
      return call<ReturnType<ImportIcebergSchema>>(() => engine.importSchema(text, options.id));
    },
    exportIcebergSchema(document: Parameters<ExportIcebergSchema>[0]): ReturnType<ExportIcebergSchema> {
      return call<ReturnType<ExportIcebergSchema>>(() => engine.exportSchema(document));
    },
    getIcebergNode(
      document: Parameters<GetIcebergNode>[0],
      pointer: Parameters<GetIcebergNode>[1],
    ): ReturnType<GetIcebergNode> {
      return call<NativeJson>(() => engine.getNode(document, pointer)) as ReturnType<GetIcebergNode>;
    },
    proposeIcebergNodeEdit(
      document: Parameters<ProposeIcebergNodeEdit>[0],
      pointer: Parameters<ProposeIcebergNodeEdit>[1],
      replacementJson: Parameters<ProposeIcebergNodeEdit>[2],
    ): ReturnType<ProposeIcebergNodeEdit> {
      return call<ReturnType<ProposeIcebergNodeEdit>>(() => engine.proposeNodeEdit(document, pointer, replacementJson));
    },
  });
}

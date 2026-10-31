// SPDX-License-Identifier: MIT OR Apache-2.0
import type {importIcebergTable, inspectIcebergTable, exportIcebergTable, getIcebergTableNode, proposeIcebergTableNodeEdit} from './table';
import type {inspectIcebergTableContext, IcebergTableContext} from './table-context';
import type {inspectIcebergTableTransforms, IcebergTableTransforms} from './table-transforms';
import type {inspectIcebergTransformType} from './transforms';
import type {proposeIcebergTableRename, IcebergTableRenameReport} from './table-rename';
import type {proposeIcebergTablePromotion, IcebergTablePromotionReport} from './table-promotion';
import type {Diagnostic, Document, ExtensionPackage, Json, Validation} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import {icebergTablePackage} from './table-package';

type NativeErrorGuard = (error: unknown) => boolean;
export interface IcebergTableNativeEngine {
  importTable(source: string, id: string): Document;
  inspect(document: Document): Validation;
  inspectPayload(payload: Json): Diagnostic[];
  exportTable(document: Document): string;
  getNode(document: Document, path: string): NativeJson;
  editNode(document: Document, path: string, replacementJson: string): ReturnType<typeof proposeIcebergTableNodeEdit>;
  inspectContext(document: Document): IcebergTableContext;
  inspectTransforms(document: Document): IcebergTableTransforms;
  inspectTransformType(sourceType: string, transform: string): ReturnType<typeof inspectIcebergTransformType>;
  proposeRename(document: Document, fieldId: number, newName: string, nextSchemaId: number): {document: Document; report: IcebergTableRenameReport};
  proposePromotion(document: Document, fieldId: number, targetType: string, nextSchemaId: number): {document: Document; report: IcebergTablePromotionReport};
}

const CONTROL_CODES = new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

/** Keep the synchronous Iceberg table API on the closed Rust source-preserving engine. */
export function createIcebergTableRustDefault(
  engine: IcebergTableNativeEngine,
  isNativeError: NativeErrorGuard = () => false,
  createRegistry: () => Registry = () => new Registry(),
) {
  const call = <T>(operation: () => T): T => {
    try { return operation(); }
    catch (error) {
      if (!isNativeError(error)) throw error;
      const native = error as {code?: unknown; message?: unknown; path?: unknown};
      if (typeof native.code !== 'string' || CONTROL_CODES.has(native.code)) throw error;
      const code = native.code;
      if (code === 'REQUEST' || code === 'JSON_SCHEMA_SYNTAX' || code.startsWith('ICEBERG_TABLE_'))
        throw new UmfError(code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : '');
      throw error;
    }
  };
  const inspectPayload = (payload: Json): Diagnostic[] => call(() => engine.inspectPayload(payload));
  return Object.freeze({
    icebergTableRegistry(): Registry { return createRegistry().register(icebergTablePackage, inspectPayload); },
    inspectIcebergTable(document: Parameters<typeof inspectIcebergTable>[0]): ReturnType<typeof inspectIcebergTable> { return call(() => engine.inspect(document)); },
    importIcebergTable(text: Parameters<typeof importIcebergTable>[0], options: Parameters<typeof importIcebergTable>[1]): ReturnType<typeof importIcebergTable> { return call(() => engine.importTable(text, options.id)); },
    exportIcebergTable(document: Parameters<typeof exportIcebergTable>[0]): ReturnType<typeof exportIcebergTable> { return call(() => engine.exportTable(document)); },
    getIcebergTableNode(document: Parameters<typeof getIcebergTableNode>[0], path: Parameters<typeof getIcebergTableNode>[1]): ReturnType<typeof getIcebergTableNode> { return call(() => engine.getNode(document, path)); },
    proposeIcebergTableNodeEdit(document: Parameters<typeof proposeIcebergTableNodeEdit>[0], path: Parameters<typeof proposeIcebergTableNodeEdit>[1], replacementJson: Parameters<typeof proposeIcebergTableNodeEdit>[2]): ReturnType<typeof proposeIcebergTableNodeEdit> { return call(() => engine.editNode(document, path, replacementJson)); },
    inspectIcebergTableContext(document: Parameters<typeof inspectIcebergTableContext>[0]): ReturnType<typeof inspectIcebergTableContext> { return call(() => engine.inspectContext(document)); },
    inspectIcebergTableTransforms(document: Parameters<typeof inspectIcebergTableTransforms>[0]): ReturnType<typeof inspectIcebergTableTransforms> { return call(() => engine.inspectTransforms(document)); },
    inspectIcebergTransformType(sourceType: Parameters<typeof inspectIcebergTransformType>[0], transform: Parameters<typeof inspectIcebergTransformType>[1]): ReturnType<typeof inspectIcebergTransformType> { return call(() => engine.inspectTransformType(sourceType, transform)); },
    proposeIcebergTableRename(document: Parameters<typeof proposeIcebergTableRename>[0], options: Parameters<typeof proposeIcebergTableRename>[1]): ReturnType<typeof proposeIcebergTableRename> { return call(() => engine.proposeRename(document, options.fieldId, options.newName, options.nextSchemaId)); },
    proposeIcebergTablePromotion(document: Parameters<typeof proposeIcebergTablePromotion>[0], options: Parameters<typeof proposeIcebergTablePromotion>[1]): ReturnType<typeof proposeIcebergTablePromotion> { return call(() => engine.proposePromotion(document, options.fieldId, options.targetType, options.nextSchemaId)); },
  });
}

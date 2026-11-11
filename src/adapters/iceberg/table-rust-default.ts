// SPDX-License-Identifier: MIT OR Apache-2.0

import type {IcebergTableContext} from './table-context';
import type {IcebergTableTransforms} from './table-transforms';
import type {inspectIcebergTransformType} from './transforms';
import type {IcebergTableRenameReport} from './table-rename';
import type {IcebergTablePromotionReport} from './table-promotion';
import type {Diagnostic, Document, ExtensionPackage, Json, Validation} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
import type {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import {icebergTablePackage} from './table-package';

type ImportIcebergTable = (text: string, options: { id: string; }) => Document;
type InspectIcebergTable = (document: Document) => Validation;
type ExportIcebergTable = (document: Document) => string;
type GetIcebergTableNode = (document: Document, path: string) => NativeJson;
type ProposeIcebergTableNodeEdit = (document: Document, path: string, text: string) => { document: Document; validation: Validation; };
type InspectIcebergTableContext = (document: Document) => IcebergTableContext;
type InspectIcebergTableTransforms = (document: Document) => IcebergTableTransforms;
type ProposeIcebergTableRename = (document: Document, options: { fieldId: number; newName: string; nextSchemaId: number; }) => { document: Document; report: IcebergTableRenameReport; };
type ProposeIcebergTablePromotion = (document: Document, options: { fieldId: number; targetType: string; nextSchemaId: number; }) => { document: Document; report: IcebergTablePromotionReport; };

type NativeErrorGuard = (error: unknown) => boolean;
export interface IcebergTableNativeEngine {
  importTable(source: string, id: string): Document;
  inspect(document: Document): Validation;
  inspectPayload(payload: Json): Diagnostic[];
  exportTable(document: Document): string;
  getNode(document: Document, path: string): NativeJson;
  editNode(document: Document, path: string, replacementJson: string): ReturnType<ProposeIcebergTableNodeEdit>;
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
  createRegistry: () => Registry,
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
    inspectIcebergTable(document: Parameters<InspectIcebergTable>[0]): ReturnType<InspectIcebergTable> { return call(() => engine.inspect(document)); },
    importIcebergTable(text: Parameters<ImportIcebergTable>[0], options: Parameters<ImportIcebergTable>[1]): ReturnType<ImportIcebergTable> { return call(() => engine.importTable(text, options.id)); },
    exportIcebergTable(document: Parameters<ExportIcebergTable>[0]): ReturnType<ExportIcebergTable> { return call(() => engine.exportTable(document)); },
    getIcebergTableNode(document: Parameters<GetIcebergTableNode>[0], path: Parameters<GetIcebergTableNode>[1]): ReturnType<GetIcebergTableNode> { return call(() => engine.getNode(document, path)); },
    proposeIcebergTableNodeEdit(document: Parameters<ProposeIcebergTableNodeEdit>[0], path: Parameters<ProposeIcebergTableNodeEdit>[1], replacementJson: Parameters<ProposeIcebergTableNodeEdit>[2]): ReturnType<ProposeIcebergTableNodeEdit> { return call(() => engine.editNode(document, path, replacementJson)); },
    inspectIcebergTableContext(document: Parameters<InspectIcebergTableContext>[0]): ReturnType<InspectIcebergTableContext> { return call(() => engine.inspectContext(document)); },
    inspectIcebergTableTransforms(document: Parameters<InspectIcebergTableTransforms>[0]): ReturnType<InspectIcebergTableTransforms> { return call(() => engine.inspectTransforms(document)); },
    inspectIcebergTransformType(sourceType: Parameters<typeof inspectIcebergTransformType>[0], transform: Parameters<typeof inspectIcebergTransformType>[1]): ReturnType<typeof inspectIcebergTransformType> { return call(() => engine.inspectTransformType(sourceType, transform)); },
    proposeIcebergTableRename(document: Parameters<ProposeIcebergTableRename>[0], options: Parameters<ProposeIcebergTableRename>[1]): ReturnType<ProposeIcebergTableRename> { return call(() => engine.proposeRename(document, options.fieldId, options.newName, options.nextSchemaId)); },
    proposeIcebergTablePromotion(document: Parameters<ProposeIcebergTablePromotion>[0], options: Parameters<ProposeIcebergTablePromotion>[1]): ReturnType<ProposeIcebergTablePromotion> { return call(() => engine.proposePromotion(document, options.fieldId, options.targetType, options.nextSchemaId)); },
  });
}

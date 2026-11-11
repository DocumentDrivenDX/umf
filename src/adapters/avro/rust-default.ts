// SPDX-License-Identifier: MIT OR Apache-2.0
import type {AvroFieldMetadata,AvroNodeEditProposal,AvroPayload} from './index';
import type {Diagnostic, Document, ExtensionPackage, Json, Validation} from '../../model/types';
import type {NativeJson} from '../json-schema/tree';
import type {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import {AVRO_EXTENSION, avroPackage} from './package';

type EditAvroNode = (document: Document, path: string, text: string, dependencyId?: string | undefined) => Document;
type ExportAvroBundle = (document: Document) => { schema: string; dependencies: { id: string; schema: string; }[]; source: Document; diagnostics: Diagnostic[]; };
type ExportAvroSchema = (document: Document) => string;
type GetAvroFieldMetadata = (document: Document) => AvroFieldMetadata[];
type GetAvroNode = (document: Document, path: string, dependencyId?: string | undefined) => NativeJson;
type ImportAvroSchema = (text: string, options: { id: string; dependencies?: { id: string; schema: string; }[]; }) => Document;
type InspectAvro = (document: Document) => Validation;
type ProposeAvroNodeEdit = (input: Document, path: string, text: string, dependencyId?: string | undefined) => AvroNodeEditProposal;

export interface AvroNativeFamilyEngine {
  avro: {
    import(fields: {source: string; id: string; dependencies?: {id: string; schema: string}[]}): unknown;
    inspect(fields: {document: Document}): unknown;
    inspectPayload(fields: {payload: Json}): unknown;
    fields(fields: {root: NativeJson; dependencies?: {id: string; root: NativeJson}[]}): unknown;
    export(fields: {document: Document}): unknown;
    exportBundle(fields: {document: Document}): unknown;
    getNode(fields: {document: Document; path: string; dependencyId?: string}): unknown;
    editNode(fields: {document: Document; path: string; replacementJson: string; dependencyId?: string}): unknown;
    proposeNodeEdit(fields: {document: Document; path: string; replacementJson: string; dependencyId?: string}): unknown;
  };
}

type NativeErrorGuard = (error: unknown) => boolean;
const CONTROL_CODES = new Set([
  'RESOURCE_LIMIT', 'CANCELLED', 'METER_FAILURE', 'CANCELLATION_CHECK_FAILURE',
  'CLOCK_CAPABILITY_REQUIRED', 'DEADLINE', 'DEADLINE_EXCEEDED',
]);

function avroPayload(document: Document): AvroPayload {
  const schema = document.modules.find((module) => module.id === 'schema');
  const element = schema?.elements.find((entry) => entry.id === 'schema');
  const value = element?.extensions[AVRO_EXTENSION];
  if (!value || typeof value !== 'object') throw new UmfError('AVRO_PAYLOAD', 'Missing Avro payload');
  return value as unknown as AvroPayload;
}

/** Preserve the current synchronous Avro API over the closed Rust family dispatcher. */
export function createAvroRustDefault(
  engine: AvroNativeFamilyEngine,
  isNativeUmfCoreError: NativeErrorGuard = () => false,
  createRegistry: () => Registry,
) {
  const call = <T>(operation: () => unknown): T => {
    try {
      return operation() as T;
    } catch (error) {
      if (!isNativeUmfCoreError(error)) throw error;
      const native = error as {code?: unknown; message?: unknown; path?: unknown};
      if (typeof native.code !== 'string' || CONTROL_CODES.has(native.code)) throw error;
      if (native.code === 'REQUEST' || native.code === 'JSON_SCHEMA_SYNTAX' || native.code.startsWith('AVRO_')) {
        throw new UmfError(native.code, String(native.message ?? ''), typeof native.path === 'string' ? native.path : '');
      }
      throw error;
    }
  };
  const admittedPayload = (document: Document): AvroPayload => {
    const validation = call<Validation>(() => engine.avro.inspect({document}));
    if (!validation.valid) {
      throw new UmfError('AVRO_DOCUMENT', JSON.stringify(validation.diagnostics));
    }
    return avroPayload(document);
  };

  return Object.freeze({
    avroRegistry(): Registry {
      return createRegistry().register(avroPackage as unknown as ExtensionPackage, (payload) =>
        call<Diagnostic[]>(() => engine.avro.inspectPayload({payload})),
      );
    },
    inspectAvro(document: Parameters<InspectAvro>[0]): ReturnType<InspectAvro> {
      return call<ReturnType<InspectAvro>>(() => engine.avro.inspect({document}));
    },
    importAvroSchema(
      text: Parameters<ImportAvroSchema>[0],
      options: Parameters<ImportAvroSchema>[1],
    ): ReturnType<ImportAvroSchema> {
      const {id, dependencies} = options;
      const document = call<ReturnType<ImportAvroSchema>>(() => engine.avro.import({source: text, id, ...(dependencies === undefined ? {} : {dependencies})}));
      admittedPayload(document);
      return document;
    },
    getAvroFieldMetadata(document: Parameters<GetAvroFieldMetadata>[0]): AvroFieldMetadata[] {
      const payload = admittedPayload(document);
      return call<AvroFieldMetadata[]>(() => engine.avro.fields({
        root: payload.root,
        ...(payload.dependencies === undefined ? {} : {dependencies: payload.dependencies}),
      }));
    },
    exportAvroSchema(document: Parameters<ExportAvroSchema>[0]): ReturnType<ExportAvroSchema> {
      admittedPayload(document);
      return call<ReturnType<ExportAvroSchema>>(() => engine.avro.export({document}));
    },
    exportAvroBundle(document: Parameters<ExportAvroBundle>[0]): ReturnType<ExportAvroBundle> {
      admittedPayload(document);
      return call<ReturnType<ExportAvroBundle>>(() => engine.avro.exportBundle({document}));
    },
    getAvroNode(
      document: Parameters<GetAvroNode>[0],
      path: Parameters<GetAvroNode>[1],
      dependencyId?: Parameters<GetAvroNode>[2],
    ): ReturnType<GetAvroNode> {
      admittedPayload(document);
      return call<ReturnType<GetAvroNode>>(() => engine.avro.getNode({document, path, ...(dependencyId === undefined ? {} : {dependencyId})}) as NativeJson);
    },
    editAvroNode(
      document: Parameters<EditAvroNode>[0],
      path: Parameters<EditAvroNode>[1],
      text: Parameters<EditAvroNode>[2],
      dependencyId?: Parameters<EditAvroNode>[3],
    ): ReturnType<EditAvroNode> {
      admittedPayload(document);
      return call<ReturnType<EditAvroNode>>(() => engine.avro.editNode({document, path, replacementJson: text, ...(dependencyId === undefined ? {} : {dependencyId})}));
    },
    proposeAvroNodeEdit(
      document: Parameters<ProposeAvroNodeEdit>[0],
      path: Parameters<ProposeAvroNodeEdit>[1],
      text: Parameters<ProposeAvroNodeEdit>[2],
      dependencyId?: Parameters<ProposeAvroNodeEdit>[3],
    ): ReturnType<ProposeAvroNodeEdit> {
      admittedPayload(document);
      return call<AvroNodeEditProposal>(() => engine.avro.proposeNodeEdit({document, path, replacementJson: text, ...(dependencyId === undefined ? {} : {dependencyId})}));
    },
  });
}

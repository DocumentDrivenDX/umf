// SPDX-License-Identifier: MIT OR Apache-2.0
import type {
  AvroFieldMetadata,
  AvroNodeEditProposal,
  AvroPayload,
  editAvroNode,
  exportAvroBundle,
  exportAvroSchema,
  getAvroFieldMetadata,
  getAvroNode,
  importAvroSchema,
  inspectAvro,
  proposeAvroNodeEdit,
} from './index';
import type {Diagnostic, Document, ExtensionPackage, Json, Validation} from '../../model/types';
import type {NativeJson} from '../json-schema/tree';
import type {Registry} from '../../registry/registry';
import {UmfError} from '../../model/errors';
import {AVRO_EXTENSION, avroPackage} from './package';

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
    inspectAvro(document: Parameters<typeof inspectAvro>[0]): ReturnType<typeof inspectAvro> {
      return call<ReturnType<typeof inspectAvro>>(() => engine.avro.inspect({document}));
    },
    importAvroSchema(
      text: Parameters<typeof importAvroSchema>[0],
      options: Parameters<typeof importAvroSchema>[1],
    ): ReturnType<typeof importAvroSchema> {
      const {id, dependencies} = options;
      const document = call<ReturnType<typeof importAvroSchema>>(() => engine.avro.import({source: text, id, ...(dependencies === undefined ? {} : {dependencies})}));
      admittedPayload(document);
      return document;
    },
    getAvroFieldMetadata(document: Parameters<typeof getAvroFieldMetadata>[0]): AvroFieldMetadata[] {
      const payload = admittedPayload(document);
      return call<AvroFieldMetadata[]>(() => engine.avro.fields({
        root: payload.root,
        ...(payload.dependencies === undefined ? {} : {dependencies: payload.dependencies}),
      }));
    },
    exportAvroSchema(document: Parameters<typeof exportAvroSchema>[0]): ReturnType<typeof exportAvroSchema> {
      admittedPayload(document);
      return call<ReturnType<typeof exportAvroSchema>>(() => engine.avro.export({document}));
    },
    exportAvroBundle(document: Parameters<typeof exportAvroBundle>[0]): ReturnType<typeof exportAvroBundle> {
      admittedPayload(document);
      return call<ReturnType<typeof exportAvroBundle>>(() => engine.avro.exportBundle({document}));
    },
    getAvroNode(
      document: Parameters<typeof getAvroNode>[0],
      path: Parameters<typeof getAvroNode>[1],
      dependencyId?: Parameters<typeof getAvroNode>[2],
    ): ReturnType<typeof getAvroNode> {
      admittedPayload(document);
      return call<ReturnType<typeof getAvroNode>>(() => engine.avro.getNode({document, path, ...(dependencyId === undefined ? {} : {dependencyId})}) as NativeJson);
    },
    editAvroNode(
      document: Parameters<typeof editAvroNode>[0],
      path: Parameters<typeof editAvroNode>[1],
      text: Parameters<typeof editAvroNode>[2],
      dependencyId?: Parameters<typeof editAvroNode>[3],
    ): ReturnType<typeof editAvroNode> {
      admittedPayload(document);
      return call<ReturnType<typeof editAvroNode>>(() => engine.avro.editNode({document, path, replacementJson: text, ...(dependencyId === undefined ? {} : {dependencyId})}));
    },
    proposeAvroNodeEdit(
      document: Parameters<typeof proposeAvroNodeEdit>[0],
      path: Parameters<typeof proposeAvroNodeEdit>[1],
      text: Parameters<typeof proposeAvroNodeEdit>[2],
      dependencyId?: Parameters<typeof proposeAvroNodeEdit>[3],
    ): ReturnType<typeof proposeAvroNodeEdit> {
      admittedPayload(document);
      return call<AvroNodeEditProposal>(() => engine.avro.proposeNodeEdit({document, path, replacementJson: text, ...(dependencyId === undefined ? {} : {dependencyId})}));
    },
  });
}

import {UmfError} from './json-schema.js';
export const ARROW_IPC_MAX_BYTES = 1_000_000;
export const ARROW_IPC_PROFILE = 'umf-r8-arrow-ipc/0.1.0';

function copyBytes(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError('Rust Arrow IPC export returned a non-Uint8Array');
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy;
}

function fromHex(value) {
  if (typeof value !== 'string' || (value.length & 1) !== 0 || !/^[0-9a-f]*$/.test(value)) {
    throw new TypeError('Rust Arrow IPC export returned invalid lowercase hexadecimal bytes');
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

/** Build the public, copy-safe projection over the tagged-wire dispatcher. */
export function createArrowIpcOperations(call) {
  return Object.freeze({
    profile: ARROW_IPC_PROFILE,
    capabilities: Object.freeze({profile: ARROW_IPC_PROFILE, maxBytes: ARROW_IPC_MAX_BYTES, exactSource: true, complete: false}),
    captureArrowIpc(bytes, options) {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > ARROW_IPC_MAX_BYTES) {
        throw new UmfError('ARROW_IPC_LIMIT', 'Expected at most 1000000 source bytes');
      }
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const id = options.id;
      if (typeof id !== 'string') throw new UmfError('ARROW_IPC_CAPTURE', 'Invalid IPC capture envelope');
      return call('capture', {bytes: hex, id});
    },
    exportArrowIpcCapture(document) {
      return copyBytes(fromHex(call('export', {document})));
    },
    inspectArrowIpcCapture(document) {
      return call('inspect', {document});
    },
    prepareArrowIpcObservation(document) { return call('prepareObserve', {document}); },
    completeArrowIpcObservation(prepared, outcome) { return call('completeObserve', {prepared, outcome}); },
    inspectArrowIpcLayout(document) {
      return call('layout', {document});
    },
    inspectArrowIpcConsistency(document) {
      return call('consistency', {document});
    },
    exportArrowSchemaIpcNative(document) {
      return copyBytes(fromHex(call('exportSchemaNative', {document})));
    },
    prepareArrowSchemaIpc(document) {
      return call('prepareSchemaExport', {document});
    },
    completeArrowSchemaIpc(document, beforeJson, afterJson, bytesHex) {
      return call('completeSchemaExport', {document, beforeJson, afterJson, bytesHex});
    },
    prepareArrowIpcRename(document, request) { return call('prepareRename', {document, request}); },
    prepareArrowIpcRenameFooter(document, request, schemaHex) { return call('prepareRenameFooter', {document, request, schemaHex}); },
    completeArrowIpcRename(document, request, schemaHex, footerHex) { return call('completeRename', {document, request, schemaHex, footerHex}); },
    renameArrowIpcFieldNative(document, request) { return call('renameNative', {document, request}); },
  });
}

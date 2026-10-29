import {UmfError} from './json-schema.js';
export const PARQUET_CAPTURE_MAX_BYTES = 1_000_000;
export const PARQUET_CAPTURE_PROFILE = 'umf-r8-parquet-capture-inspection/0.1.0';

function copyBytes(input) {
  if (!(input instanceof Uint8Array)) throw new TypeError('Rust Parquet export returned a non-Uint8Array');
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy;
}

function fromHex(value) {
  if (typeof value !== 'string' || (value.length & 1) !== 0 || !/^[0-9a-f]*$/.test(value)) {
    throw new TypeError('Rust Parquet export returned invalid lowercase hexadecimal bytes');
  }
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  return bytes;
}

/** Expose the opt-in bounded Rust Parquet operations without changing TS defaults. */
export function createParquetCaptureOperations(call) {
  return Object.freeze({
    profile: PARQUET_CAPTURE_PROFILE,
    capabilities: Object.freeze({profile: PARQUET_CAPTURE_PROFILE, maxBytes: PARQUET_CAPTURE_MAX_BYTES, exactSource: true, complete: false}),
    captureParquet(bytes, options) {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > PARQUET_CAPTURE_MAX_BYTES) {
        throw new UmfError('PARQUET_LIMIT', 'Expected at most 1000000 source bytes');
      }
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const id = options.id;
      if (typeof id !== 'string') throw new UmfError('PARQUET_CAPTURE', 'Invalid Parquet capture envelope');
      return call('capture', {bytes: hex, id});
    },
    importParquetSchema(bytes, options) {
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > PARQUET_CAPTURE_MAX_BYTES) {
        throw new UmfError('PARQUET_LIMIT', 'Expected at most 1000000 source bytes');
      }
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      const id = options.id;
      if (typeof id !== 'string') throw new UmfError('PARQUET_CAPTURE', 'Invalid Parquet capture envelope');
      return call('importSchema', {bytes: hex, id});
    },
    encodeParquetWire(value) { return copyBytes(fromHex(call('encodeWire', {value}))); },
    exportParquetCapture(document) { return copyBytes(fromHex(call('export', {document}))); },
    inspectParquetFraming(document) { return call('inspectFraming', {document}); },
    decodeParquetFooter(document) { return call('decodeFooter', {document}); },
    inspectParquetMetadata(document) { return call('inspectMetadata', {document}); },
    inspectParquetSchema(document) { return call('inspectSchema', {document}); },
    inspectParquetLogicalTypes(document) { return call('inspectLogicalTypes', {document}); },
    inspectParquetContainers(document) { return call('inspectContainers', {document}); },
    getParquetFieldMetadata(document) { return call('getFieldMetadata', {document}); },
  });
}

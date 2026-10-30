import {UmfError} from './json-schema.js';
export const PARQUET_CAPTURE_MAX_BYTES = 1_000_000;
export const PARQUET_CAPTURE_PROFILE = 'umf-r8-parquet-capture-inspection/0.1.0';
const CONTROL_CODES = new Set(['RESOURCE_LIMIT', 'CANCELLED', 'METER_FAILURE', 'CANCELLATION_CHECK_FAILURE', 'CLOCK_CAPABILITY_REQUIRED', 'DEADLINE']);

function fromHex(value, work) {
  if (typeof value !== 'string' || (value.length & 1) !== 0) {
    throw new TypeError('Rust Parquet export returned invalid lowercase hexadecimal bytes');
  }
  if (value.length > PARQUET_CAPTURE_MAX_BYTES * 2) throw new UmfError('PARQUET_LIMIT', 'Expected at most 1000000 source bytes');
  work?.(value.length);
  if (!/^[0-9a-f]*$/.test(value)) throw new TypeError('Rust Parquet export returned invalid lowercase hexadecimal bytes');
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    if ((index & 2047) === 0) work?.(1);
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** Expose the opt-in bounded Rust Parquet operations without changing TS defaults. */
function materialize(value, prototype, work, copiedTree = false) {
  if (value === null || typeof value !== 'object' || value instanceof Uint8Array) return value;
  work?.(1);
  if (Array.isArray(value)) {
    work?.(value.length);
    return value.map(item => materialize(item, copiedTree ? null : prototype, work, copiedTree));
  }
  const result = Object.create(prototype);
  for (const key of Object.keys(value)) {
    work?.(key.length + 1);
    const copiedJson = copiedTree || key === 'source' || key === 'output' || key === 'nativeField';
    Object.defineProperty(result, key, {
      value: materialize(value[key], copiedJson ? null : Object.prototype, work, copiedJson),
      enumerable: true, writable: true, configurable: true,
    });
  }
  return result;
}

function materializeResult(value, work) { return materialize(value, Object.prototype, work); }

function bytesToHex(bytes, transaction, prepareTransaction) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > PARQUET_CAPTURE_MAX_BYTES) {
    throw new UmfError('PARQUET_LIMIT', 'Expected at most 1000000 source bytes');
  }
  prepareTransaction?.(transaction);
  const charge = transaction.hostWork;
  charge?.(1);
  const iteratorMethod = bytes[Symbol.iterator];
  if (typeof iteratorMethod !== 'function') throw new TypeError('bytes is not iterable');
  charge?.(1);
  const iterator = iteratorMethod.call(bytes);
  const chunks = [];
  let chunk = '';
  let count = 0;
  let textUnits = 0;
  for (;;) {
    charge?.(1);
    const next = iterator.next();
    if (next.done) break;
    if (++count > PARQUET_CAPTURE_MAX_BYTES) throw new UmfError('PARQUET_LIMIT', 'Expected at most 1000000 source bytes');
    charge?.(1);
    const rendered = '' + next.value.toString(16).padStart(2, '0');
    if (rendered.length > PARQUET_CAPTURE_MAX_BYTES * 2 - textUnits) {
      throw new UmfError('PARQUET_LIMIT', 'Expected at most 1000000 source bytes');
    }
    charge?.(rendered.length);
    textUnits += rendered.length;
    chunk += rendered;
    if ((count & 2047) === 0) { chunks.push(chunk); chunk = ''; }
  }
  if (chunk) chunks.push(chunk);
  charge?.(textUnits + 1);
  return chunks.join('');
}

export function createParquetCaptureOperations(call, host = {}) {
  const run = (operation, fields, transaction = {}) => call(operation, fields, transaction);
  const invoke = (operation, fields, transaction = {}) => {
    host.prepareTransaction?.(transaction);
    return materializeResult(run(operation, fields, transaction), transaction.materializeWork);
  };
  const document = (operation, source, fields = {}, transaction = {}) => invoke(operation, {document: source, ...fields}, transaction);
  const checkedSource = (operation, source, transaction) => {
    const inspected = document(operation, source, {}, transaction);
    return inspected;
  };
  return Object.freeze({
    profile: PARQUET_CAPTURE_PROFILE,
    capabilities: Object.freeze({profile: PARQUET_CAPTURE_PROFILE, maxBytes: PARQUET_CAPTURE_MAX_BYTES, exactSource: true, complete: false}),
    captureParquet(bytes, options) {
      const transaction = {};
      const hex = bytesToHex(bytes, transaction, host.prepareTransaction);
      const id = options.id;
      if (typeof id !== 'string') throw new UmfError('PARQUET_CAPTURE', 'Invalid Parquet capture envelope');
      return invoke('capture', {bytes: hex, id}, transaction);
    },
    importParquetSchema(bytes, options) {
      const transaction = {};
      const hex = bytesToHex(bytes, transaction, host.prepareTransaction);
      const id = options.id;
      if (typeof id !== 'string') throw new UmfError('PARQUET_CAPTURE', 'Invalid Parquet capture envelope');
      return invoke('importSchema', {bytes: hex, id}, transaction);
    },
    encodeParquetWire(value) {
      const transaction = {};
      const result = invoke('encodeWire', {value}, transaction);
      return fromHex(result, transaction.hostWork);
    },
    exportParquetCapture(source) {
      const transaction = {};
      const result = document('export', source, {}, transaction);
      return fromHex(result, transaction.hostWork);
    },
    inspectParquetFraming(source) { return document('inspectFraming', source); },
    decodeParquetFooter(source) { return document('decodeFooter', source); },
    inspectParquetMetadata(source) { return document('inspectMetadata', source); },
    inspectParquetSchema(source) { return document('inspectSchema', source); },
    inspectParquetPages(source) { return document('inspectPages', source); },
    decodeParquetPageBodies(source) { return document('decodePageBodies', source); },
    decodeParquetLevels(source) { return document('decodeLevels', source); },
    decodeParquetPhysical(source) { return document('decodePhysical', source); },
    decodeParquetValues(source) { return document('decodeValues', source); },
    assembleParquetRows(source) { return document('assembleRows', source); },
    repairParquetDictionaryOffsets(source) { return document('repairDictionaryOffsets', source); },
    inspectParquetLogicalTypes(source) { return document('inspectLogicalTypes', source); },
    inspectParquetContainers(source) { return document('inspectContainers', source); },
    getParquetFieldMetadata(source) { return document('getFieldMetadata', source); },
    appendParquetKeyValueMetadata(source, entries) {
      const transaction = {};
      const inspected = checkedSource('inspectMetadata', source, transaction);
      if (inspected.status !== 'mapped') return {source: inspected.source, status: 'blocked', complete: false, diagnostics: [...inspected.diagnostics]};
      let admitted = entries;
      if (typeof host.copyJson === 'function') {
        host.prepareTransaction?.(transaction);
        try { admitted = host.copyJson(entries, transaction); }
        catch (error) {
          if (!host.isHostJsonResponseError?.(error) || CONTROL_CODES.has(error?.code)) throw error;
          return {source: inspected.source, status: 'blocked', complete: false, diagnostics: [...inspected.diagnostics, {code: 'PARQUET_METADATA_EDIT_BLOCKED', path: '', severity: 'error', message: String(error?.message ?? '')}]};
        }
      }
      return invoke('appendKeyValueMetadata', {document: source, entries: admitted}, transaction);
    },
    renameParquetField(source, index, name) {
      const transaction = {};
      if (Number.isInteger(index) && index > 0 && typeof name === 'string') return document('renameField', source, {index, name});
      const inspected = checkedSource('inspectContainers', source, transaction);
      if (inspected.status !== 'checked') return {source: inspected.source, status: 'blocked', complete: false, diagnostics: [...inspected.diagnostics]};
      const path = '/schema/' + index;
      const message = !Number.isInteger(index) || index <= 0
        ? 'Expected a non-root schema index'
        : 'Expected a nonempty lossless UTF-8 name up to 100000 UTF-16 units';
      return {source: inspected.source, status: 'blocked', complete: false, diagnostics: [...inspected.diagnostics, {code: 'PARQUET_RENAME_BLOCKED', path, severity: 'error', message}]};
    },
  });
}

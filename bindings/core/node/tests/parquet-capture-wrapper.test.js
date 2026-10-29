import {describe, expect, test} from 'bun:test';
import {createParquetCaptureOperations, PARQUET_CAPTURE_PROFILE} from '../src/parquet-capture.js';
import {UmfError} from '../src/json-schema.js';
import {createParquetCaptureOperations as createWasmOperations} from '../../wasm/src/parquet-capture.js';
import {UmfError as WasmUmfError} from '../../wasm/src/json-schema.js';

for (const [host, factory, ErrorType] of [['Node', createParquetCaptureOperations, UmfError], ['WASM', createWasmOperations, WasmUmfError]]) {
  describe(`${host} Parquet capture wrapper`, () => {
    test('preserves nonzero byte views, copies exported bytes, and dispatches the metadata operations', () => {
      const calls = [];
      const engine = factory((operation, fields) => {
        calls.push([operation, fields]);
        if (operation === 'export') return '00abff';
        return operation === 'capture' || operation === 'importSchema' ? fields : {operation, complete: false};
      });
      const backing = new Uint8Array([0x99, 0x00, 0xab, 0xff, 0x88]);
      const view = new Uint8Array(backing.buffer, 1, 3);
      const captured = engine.captureParquet(view, {id: 'capture-1'});
      const imported = engine.importParquetSchema(view, {id: 'import-1'});
      backing.fill(0x11);
      expect(captured).toEqual({bytes: '00abff', id: 'capture-1'});
      expect(imported).toEqual({bytes: '00abff', id: 'import-1'});
      const exported = engine.exportParquetCapture({id: 'capture-1'});
      expect([...exported]).toEqual([0, 0xab, 0xff]);
      exported.fill(9);
      expect([...engine.exportParquetCapture({id: 'capture-1'})]).toEqual([0, 0xab, 0xff]);
      engine.inspectParquetFraming({});
      engine.decodeParquetFooter({});
      engine.inspectParquetMetadata({});
      engine.inspectParquetSchema({});
      engine.inspectParquetPages({});
      engine.decodeParquetPageBodies({});
      engine.decodeParquetLevels({});
      engine.inspectParquetLogicalTypes({});
      engine.inspectParquetContainers({});
      engine.getParquetFieldMetadata({});
      expect(calls.map(([operation]) => operation)).toEqual([
        'capture', 'importSchema', 'export', 'export', 'inspectFraming', 'decodeFooter', 'inspectMetadata', 'inspectSchema',
        'inspectPages', 'decodePageBodies', 'decodeLevels', 'inspectLogicalTypes', 'inspectContainers', 'getFieldMetadata',
      ]);
      expect(engine.profile).toBe(PARQUET_CAPTURE_PROFILE);
      expect(engine.capabilities).toEqual({profile: PARQUET_CAPTURE_PROFILE, maxBytes: 1_000_000, exactSource: true, complete: false});
    });

    test('refuses source bounds before reading caller id and validates native export bytes', () => {
      const engine = factory(() => 'ABC');
      const error = (() => { try { engine.captureParquet(new Uint8Array(1_000_001), {get id() { throw Error('read'); }}); } catch (e) { return e; } })();
      expect(error).toBeInstanceOf(ErrorType);
      expect({code: error.code, message: error.message}).toEqual({code: 'PARQUET_LIMIT', message: 'Expected at most 1000000 source bytes'});
      expect(() => engine.exportParquetCapture({})).toThrow(/lowercase hexadecimal/);
    });
  });
}

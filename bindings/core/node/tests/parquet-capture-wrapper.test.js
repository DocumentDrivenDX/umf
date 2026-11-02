import {describe, expect, test} from 'bun:test';
import {createParquetCaptureOperations, PARQUET_CAPTURE_PROFILE} from '../src/parquet-capture.js';
import {UmfError} from '../src/json-schema.js';
import {createParquetCaptureOperations as createWasmOperations} from '../../wasm/src/parquet-capture.js';
import {UmfError as WasmUmfError} from '../../wasm/src/json-schema.js';

for (const [host, factory, ErrorType] of [['Node', createParquetCaptureOperations, UmfError], ['WASM', createWasmOperations, WasmUmfError]]) {
  describe(`${host} Parquet capture wrapper`, () => {
    test('precharges returned array size before materializing its items', () => {
      let charged = 0;
      const result = [{value: true}];
      const observed = new Proxy(result, {
        get(target, key, receiver) {
          if (key === '0') expect(charged).toBeGreaterThanOrEqual(2);
          return Reflect.get(target, key, receiver);
        },
      });
      const engine = factory(() => observed, {
        prepareTransaction(transaction) { transaction.materializeWork = amount => { charged += amount; }; },
      });
      expect(engine.inspectParquetFraming({})).toEqual([{value: true}]);
      expect(charged).toBeGreaterThanOrEqual(2);
    });

    test('preserves nonzero byte views, copies exported bytes, and dispatches the metadata operations', () => {
      const calls = [];
      const engine = factory((operation, fields) => {
        calls.push([operation, fields]);
        if (operation === 'export') return '00abff';
        if (operation === 'encodeWire') return '00';
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
      expect([...engine.encodeParquetWire({kind: 'binary', hex: undefined})]).toEqual([0]);
      expect(calls.at(-1)).toEqual(['encodeWire', {value: {kind: 'binary', hex: undefined}}]);
      const badSymbol = Symbol('bad');
      expect([...engine.encodeParquetWire({kind: 'binary', hex: badSymbol})]).toEqual([0]);
      expect(calls.at(-1)).toEqual(['encodeWire', {value: {kind: 'binary', hex: badSymbol}}]);
      expect(calls.map(([operation]) => operation)).toEqual([
        'capture', 'importSchema', 'export', 'export', 'inspectFraming', 'decodeFooter', 'inspectMetadata', 'inspectSchema',
        'inspectPages', 'decodePageBodies', 'decodeLevels', 'inspectLogicalTypes', 'inspectContainers', 'getFieldMetadata',
        'encodeWire', 'encodeWire',
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

    test('prepares and meters a hostile byte iterator before materializing hexadecimal input', () => {
      let prepared = false;
      let yielded = 0;
      const bytes = new Uint8Array(1);
      Object.defineProperty(bytes, Symbol.iterator, {value: () => ({next() { yielded++; return {value: 0x41, done: false}; }})});
      const engine = factory(() => ({}), {
        prepareTransaction(transaction) {
          prepared = true;
          let work = 0;
          transaction.hostWork = () => { if (++work > 4) throw new Error('meter stop'); };
        },
      });
      expect(() => engine.captureParquet(bytes, {id: 'hostile'})).toThrow('meter stop');
      expect(prepared).toBe(true);
      expect(yielded).toBeLessThanOrEqual(4);
    });

    test('bounds custom byte rendering before joining input chunks', () => {
      const bytes = new Uint8Array(1);
      Object.defineProperty(bytes, Symbol.iterator, {value: function* () {
        yield {toString() { return 'a'.repeat(2_000_001); }};
      }});
      let dispatched = false;
      const engine = factory(() => { dispatched = true; return {}; });
      expect(() => engine.captureParquet(bytes, {id: 'oversized-render'})).toThrow(expect.objectContaining({code: 'PARQUET_LIMIT'}));
      expect(dispatched).toBe(false);
    });

    test('preserves staged edit admission, malformed rename names, and ordinary/copy prototypes', () => {
      const source = {id: 'source', nested: {value: 1}};
      const calls = [];
      const hostAdmission = Object.assign(new Error('Value is not JSON-compatible'), {code: 'NON_JSON', path: ''});
      const engine = factory((operation, fields) => {
        calls.push(operation);
        if (operation === 'inspectMetadata') return {source, status: 'mapped', complete: false, diagnostics: []};
        if (operation === 'inspectContainers') return {source, status: 'checked', complete: false, diagnostics: [], containers: []};
        return {source, status: 'blocked', complete: false, diagnostics: []};
      }, {
        copyJson: () => { throw hostAdmission; },
        isHostJsonResponseError: error => error === hostAdmission,
      });

      const appended = engine.appendParquetKeyValueMetadata({}, undefined);
      expect(appended.status).toBe('blocked');
      expect(appended.diagnostics.at(-1)).toEqual({code: 'PARQUET_METADATA_EDIT_BLOCKED', path: '', severity: 'error', message: 'Value is not JSON-compatible'});
      expect(Object.getPrototypeOf(appended)).toBe(Object.prototype);
      expect(Object.getPrototypeOf(appended.source)).toBe(null);
      expect(Object.getPrototypeOf(appended.source.nested)).toBe(null);
      expect(calls).toEqual(['inspectMetadata']);

      const renamed = engine.renameParquetField({}, 1, undefined);
      expect(renamed.diagnostics.at(-1)).toMatchObject({code: 'PARQUET_RENAME_BLOCKED', path: '/schema/1', message: 'Expected a nonempty lossless UTF-8 name up to 100000 UTF-16 units'});
      expect(calls).toEqual(['inspectMetadata', 'inspectContainers']);
      expect(() => engine.renameParquetField({}, Symbol('index'), 'field')).toThrow(TypeError);
      expect(calls.at(-1)).toBe('inspectContainers');
    });
  });
}

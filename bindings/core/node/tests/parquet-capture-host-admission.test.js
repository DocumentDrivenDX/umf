import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createParquetCaptureEngine, UmfCoreError, isNativeUmfCoreError} from '../index.js';
import {UmfError} from '../src/json-schema.js';

test('Node Parquet host boundary preserves predecessor staged admission and result prototypes', () => {
  const engine = createParquetCaptureEngine();
  const bytes = new Uint8Array(readFileSync(resolve(import.meta.dir, '../../../../fixtures/parquet/logical/string.parquet')));
  const source = engine.captureParquet(bytes, {id: 'host-admission'});

  const append = engine.appendParquetKeyValueMetadata(source, undefined);
  expect(append.status).toBe('blocked');
  expect(append.diagnostics.at(-1)).toMatchObject({code: 'PARQUET_METADATA_EDIT_BLOCKED', path: '', severity: 'error'});
  const appendNestedUndefined = engine.appendParquetKeyValueMetadata(source, [{key: 'custom', value: undefined}]);
  expect(appendNestedUndefined.status).toBe('blocked');
  expect(appendNestedUndefined.diagnostics.at(-1)).toMatchObject({code: 'PARQUET_METADATA_EDIT_BLOCKED', path: '', severity: 'error'});

  const rename = engine.renameParquetField(source, 1, undefined);
  expect(rename.status).toBe('blocked');
  expect(rename.diagnostics.at(-1)).toMatchObject({code: 'PARQUET_RENAME_BLOCKED', path: '/schema/1', message: 'Expected a nonempty lossless UTF-8 name up to 100000 UTF-16 units'});

  let encodeError;
  try { engine.encodeParquetWire({kind: 'binary', hex: undefined}); } catch (error) { encodeError = error; }
  expect(encodeError).toBeInstanceOf(UmfError);
  expect({code: encodeError.code, message: encodeError.message}).toEqual({code: 'PARQUET_WIRE_ENCODE', message: 'Binary length exceeds limit'});
  expect(isNativeUmfCoreError(encodeError)).toBe(false);
  expect(encodeError).not.toBeInstanceOf(UmfCoreError);
  expect(() => engine.encodeParquetWire({kind: 'uuid', hex: undefined})).toThrow(expect.objectContaining({code: 'PARQUET_WIRE_ENCODE', message: 'Invalid exact byte encoding'}));
  expect(() => engine.encodeParquetWire({kind: 'binary', hex: Symbol('bad')})).toThrow(expect.objectContaining({code: 'PARQUET_WIRE_ENCODE', message: 'Binary length exceeds limit'}));
  expect(() => engine.encodeParquetWire({kind: 'uuid', hex: () => 'bad'})).toThrow(expect.objectContaining({code: 'PARQUET_WIRE_ENCODE', message: 'Invalid exact byte encoding'}));
  expect([...engine.encodeParquetWire({kind: 'map', entries: [], keyType: undefined})]).toEqual([0]);
  expect(() => engine.encodeParquetWire({kind: 'binary', hex: '00', unknown: undefined})).toThrow(expect.objectContaining({code: 'PARQUET_WIRE_ENCODE', message: 'Unknown wire representation fields cannot be discarded'}));

  const framing = engine.inspectParquetFraming(source);
  expect(Object.getPrototypeOf(framing)).toBe(Object.prototype);
  expect(Object.getPrototypeOf(framing.source)).toBe(null);
  expect(Object.getPrototypeOf(framing.source.modules[0])).toBe(null);
});

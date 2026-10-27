import {describe, expect, test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {resolve} from 'node:path';
import {createArrowIpcOperations as createNodeOperations, ARROW_IPC_PROFILE} from '../src/arrow-ipc.js';
import {createArrowIpcOperations as createWasmOperations} from '../../wasm/src/arrow-ipc.js';
import {createArrowIpcEngine as createWasmEngine} from '../../wasm/index.js';
import {encodeWire, fromWire} from '../../wasm/src/wire.js';

for (const [host, factory] of [['Node', createNodeOperations], ['WASM', createWasmOperations]]) {
  describe(`${host} Arrow IPC capture wrapper`, () => {
    test('sends copied lowercase hex and returns a fresh byte array', () => {
      const calls = [];
      const engine = factory((operation, fields) => {
        calls.push([operation, fields]);
        if (operation === 'export') return '00abff';
        if (operation === 'inspect') return {valid: true, complete: false, diagnostics: []};
        return {id: fields.id};
      });
      const bytes = new Uint8Array([0, 0xab, 0xff]);
      const result = engine.captureArrowIpc(bytes, {id: 'capture-1'});
      bytes.fill(1);
      expect(result).toEqual({id: 'capture-1'});
      expect(calls[0]).toEqual(['capture', {bytes: '00abff', id: 'capture-1'}]);
      const exported = engine.exportArrowIpcCapture({id: 'capture-1'});
      expect([...exported]).toEqual([0, 0xab, 0xff]);
      exported.fill(7);
      expect([...engine.exportArrowIpcCapture({id: 'capture-1'})]).toEqual([0, 0xab, 0xff]);
      expect(engine.inspectArrowIpcCapture({id: 'capture-1'}).complete).toBe(false);
      expect(calls.slice(1).map(([operation]) => operation)).toEqual(['export', 'export', 'inspect']);
    });

    test('declares the bounded opt-in profile and rejects invalid input/output shapes', () => {
      const engine = factory((_operation, fields) => fields.bytes ?? 'ABC');
      expect(ARROW_IPC_PROFILE).toBe('umf-r8-arrow-ipc/0.1.0');
      expect(engine.profile).toBe(ARROW_IPC_PROFILE);
      expect(engine.capabilities).toEqual({profile: ARROW_IPC_PROFILE, maxBytes: 1_000_000, exactSource: true, complete: false});
      expect(() => engine.captureArrowIpc([1, 2], {id: 'x'})).toThrow(/Uint8Array/);
      expect(engine.captureArrowIpc(new Uint8Array(1_000_001), {id: 'x'})).toBe('00'.repeat(1_000_001));
      expect(() => engine.captureArrowIpc(new Uint8Array(), {})).toThrow(/id/);
      expect(() => engine.exportArrowIpcCapture({})).toThrow(/lowercase hexadecimal/);
    });

    test('replays the predecessor corpus native source bytes through copied wrapper buffers', async () => {
      const root = resolve(import.meta.dir, '../../../../');
      const evidencePath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r5-arrow-ipc-capture-predecessor-20261027/typescript-arrow-ipc-capture.json.gz');
      const packet = JSON.parse(gunzipSync(await readFile(evidencePath)).toString('utf8'));
      const corpusCases = packet.cases.filter(row => row.file);
      expect(corpusCases).toHaveLength(18);
      for (const row of corpusCases) {
        const source = new Uint8Array(await readFile(resolve(root, 'fixtures/arrow/ipc-inputs', row.file)));
        expect(source.byteLength).toBe(row.input.byteLength);
        expect(createHash('sha256').update(source).digest('hex')).toBe(row.input.sha256);
        const engine = factory((operation, fields) => operation === 'capture'
          ? {id: fields.id, bytes: fields.bytes}
          : fields.document.bytes);
        const document = engine.captureArrowIpc(source, {id: row.name});
        source.fill(0);
        const exported = engine.exportArrowIpcCapture(document);
        expect(exported.byteLength).toBe(row.export.byteLength);
        expect(createHash('sha256').update(exported).digest('hex')).toBe(row.export.sha256);
      }
      expect(packet.mutations).toHaveLength(7);
    });
  });
}

test('WASM engine dispatches the fixed operations and forwards host controls', () => {
  const calls = [];
  let metered = 0;
  const module = {
    arrowIpcProfileVersion: () => ARROW_IPC_PROFILE,
    executeArrowIpcWire(wire, control) {
      control?.(1);
      const request = fromWire(JSON.parse(wire));
      calls.push(request);
      const value = request.op === 'arrow.ipc.capture' ? {id: request.id} :
        request.op === 'arrow.ipc.export' ? '0102' : {valid: true, complete: false, diagnostics: []};
      return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: encodeWire(value)});
    },
  };
  const engine = createWasmEngine(module, {controls: {meter(amount) { metered += amount; }}});
  engine.captureArrowIpc(new Uint8Array([0x12, 0xab]), {id: 'wire-test'});
  expect([...engine.exportArrowIpcCapture({id: 'wire-test'})]).toEqual([1, 2]);
  expect(engine.inspectArrowIpcCapture({id: 'wire-test'}).complete).toBe(false);
  expect(calls.map(call => call.op)).toEqual(['arrow.ipc.capture', 'arrow.ipc.export', 'arrow.ipc.inspect']);
  expect(calls[0]).toEqual({op: 'arrow.ipc.capture', bytes: '12ab', id: 'wire-test'});
  expect(metered).toBeGreaterThan(0);
});

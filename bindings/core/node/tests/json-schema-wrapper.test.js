import {describe, expect, test} from 'bun:test';
import {createJsonSchemaOperations as createNodeOperations, jsonSchemaFailureError, UmfError} from '../src/json-schema.js';
import {createJsonSchemaOperations as createWasmOperations} from '../../wasm/src/json-schema.js';
import {encodeWire} from '../src/wire.js';
import {editJsonSchemaNode as sourceEditJsonSchemaNode, getJsonSchemaNode as sourceGetJsonSchemaNode} from '../../../../src/adapters/json-schema/index.ts';

for (const [host, factory] of [['Node', createNodeOperations], ['WASM', createWasmOperations]]) {
  describe(`${host} JSON Schema wrapper shapes`, () => {
    test('preflights before descriptor-safe import resource admission', () => {
      const order = [];
      const api = factory((op, fields) => { order.push('call'); return {op, fields}; }, () => { order.push('preflight'); return {}; });
      let getterCalls = 0;
      const resources = {};
      Object.defineProperty(resources, 'https://example.test/r', {enumerable: true, get() { getterCalls++; return '{}'; }});
      expect(() => api.importJsonSchema('{}', {id: 'urn:x', baseUri: 'https://example.test/', resources})).toThrow(/enumerable data property/);
      expect(getterCalls).toBe(0);
      expect(order).toEqual(['preflight']);
    });

    test('refuses non-enumerable and symbol resource keys without reading values', () => {
      const api = factory(() => { throw new Error('dispatch must not run'); }, () => ({}));
      const nonEnumerable = {};
      Object.defineProperty(nonEnumerable, 'https://example.test/r', {value: '{}', enumerable: false});
      expect(() => api.importJsonSchema('{}', {id: 'urn:x', baseUri: 'https://example.test/', resources: nonEnumerable})).toThrow(/enumerable data property/);
      const symbolic = {[Symbol('resource')]: '{}'};
      expect(() => api.importJsonSchema('{}', {id: 'urn:x', baseUri: 'https://example.test/', resources: symbolic})).toThrow(/resource URI keys must be strings/);
    });

    test('charges resource key count before reading any resource descriptor', () => {
      let descriptorReads = 0;
      const resources = new Proxy({}, {
        ownKeys: () => Array.from({length: 10_000}, (_, index) => `urn:resource:${index}`),
        getOwnPropertyDescriptor(_target, key) { descriptorReads++; return {value: '{}', enumerable: true, configurable: true}; },
      });
      let charged = 0;
      class ControlError extends Error { constructor(code, message, path) { super(message); Object.assign(this, {code, path}); } }
      const api = factory(() => { throw new Error('dispatch must not run'); }, () => ({work(amount) {
        charged += amount;
        if (charged > 1) throw new ControlError('RESOURCE_LIMIT', 'Host work budget exceeded');
      }}));
      expect(() => api.importJsonSchema('{}', {id: 'urn:x', baseUri: 'https://example.test/', resources})).toThrow('Host work budget exceeded');
      expect(descriptorReads).toBe(0);
      expect(charged).toBeGreaterThan(1);
    });

    test('charges resource map reconstruction work', () => {
      let charged = 0;
      const api = factory((op) => op === 'exportJsonSchemaResources' ? [{uri: 'urn:one', source: '{}'}, {uri: 'urn:two', source: '{}'}] : null,
        () => ({work(amount) { charged += amount; }}));
      api.exportJsonSchemaResources({});
      expect(charged).toBeGreaterThan(1);
    });

    test('returns URI-keyed maps and the predecessor bundle property names safely', () => {
      const api = factory((op) => {
        if (op === 'exportJsonSchemaResources') return [{'uri': '__proto__', source: 'root'}, {uri: 'https://example.test/a', source: 'resource'}];
        return {root: 'root', resources: [{'uri': '__proto__', source: 'root'}], source: {preserved: true}, diagnostics: []};
      }, () => ({}));
      const resources = api.exportJsonSchemaResources({});
      expect(Object.getPrototypeOf(resources)).toBe(null);
      expect(Object.hasOwn(resources, '__proto__')).toBe(true);
      expect(Object.keys(resources)).toEqual(['__proto__', 'https://example.test/a']);
      const bundle = api.exportJsonSchemaBundle({});
      expect(bundle.schema).toBe('root');
      expect(bundle.source).toEqual({preserved: true});
      expect(bundle.diagnostics).toEqual([]);
      expect(Object.hasOwn(bundle.resources, '__proto__')).toBe(true);
    });

    test('projects bundle diagnostics in predecessor field order', () => {
      const api = factory(() => ({
        root: '{}',
        resources: [],
        source: {},
        diagnostics: [{code: 'SOURCE_ARTIFACT_REQUIRED', path: '', message: 'Retain source', severity: 'warning'}],
      }), () => ({}));
      const bundle = api.exportJsonSchemaBundle({});
      expect(Object.keys(bundle.diagnostics[0])).toEqual(['code', 'path', 'severity', 'message']);
      expect(JSON.stringify(bundle.diagnostics[0])).toBe('{"code":"SOURCE_ARTIFACT_REQUIRED","path":"","severity":"warning","message":"Retain source"}');
    });

    test('routes parser and atomic edit through the opt-in dispatcher', () => {
      const calls = [];
      const api = factory((op, fields) => { calls.push([op, fields]); return {kind: 'string', value: 'parsed'}; }, () => ({}));
      api.parseNativeJson('{"x":1}');
      api.parseNativeYaml('x: 1');
      api.editJsonSchemaNode({id: 'doc'}, '/properties/x', 'false');
      expect(calls).toEqual([
        ['parseNativeJson', {source: '{"x":1}'}],
        ['parseNativeYaml', {source: 'x: 1'}],
        ['editJsonSchemaNode', {document: {id: 'doc'}, pointer: '/properties/x', replacement: 'false'}],
      ]);
    });

    test('keeps non-string node pointers as native TypeErrors before Rust dispatch', () => {
      for (const pointer of [7, null, undefined, {}]) {
        for (const operation of ['getJsonSchemaNode', 'editJsonSchemaNode']) {
          let dispatches = 0;
          let preflights = 0;
          const api = factory(() => { dispatches++; return true; }, () => { preflights++; return {}; });
          const invoke = () => operation === 'getJsonSchemaNode'
            ? api.getJsonSchemaNode({}, pointer)
            : api.editJsonSchemaNode({}, pointer, 'false');

          let sourceError;
          try { pointer.startsWith('/'); } catch (error) { sourceError = error; }
          expect(sourceError).toBeInstanceOf(TypeError);
          try { invoke(); throw new Error('expected native TypeError'); } catch (error) {
            expect(error).toBeInstanceOf(TypeError);
            expect(error.message).toBe(sourceError.message);
          }
          expect(dispatches).toBe(operation === 'getJsonSchemaNode' ? 1 : 0);
          // edit validates pointer first; get preflights and sends document-only
          // validation before the native pointer error to preserve predecessor order.
          expect(preflights).toBe(operation === 'getJsonSchemaNode' ? 1 : 0);
        }
      }
    });

    test('matches predecessor first fault when invalid document and non-string pointer cross', () => {
      const document = {};
      const pointer = 7;
      let expected;
      try { sourceGetJsonSchemaNode(document, pointer); } catch (error) { expected = error; }
      const api = factory((op) => {
        if (op === 'validateJsonSchemaDocumentForGet') throw expected;
        throw new Error('get dispatch must not run');
      }, () => ({}));
      let actual;
      try { api.getJsonSchemaNode(document, pointer); } catch (error) { actual = error; }
      expect(actual).toBe(expected);
    });

    test('preserves document Proxy sentinel before observing crossed pointer', () => {
      const events = [];
      const sentinel = new Error('document ownKeys sentinel');
      const document = new Proxy({}, {ownKeys() { events.push('document.ownKeys'); throw sentinel; }});
      const pointer = Object.defineProperty({}, 'startsWith', {get() { events.push('pointer.startsWith'); return () => true; }});
      const api = factory((_op, fields) => { Reflect.ownKeys(fields.document); return true; }, () => ({}));
      let actual;
      try { api.getJsonSchemaNode(document, pointer); } catch (error) { actual = error; }
      expect(actual).toBe(sentinel);
      expect(events).toEqual(['document.ownKeys']);
    });

    test('get preserves a non-string pointer startsWith method call before dispatch', () => {
      const trace = [];
      let dispatches = 0;
      const pointer = {startsWith(prefix) { trace.push(prefix); return true; }};
      const api = factory(() => { dispatches++; return 'dispatched'; }, () => ({}));
      expect(api.getJsonSchemaNode({}, pointer)).toBe('dispatched');
      expect(trace).toEqual(['/']);
      expect(dispatches).toBe(2);
    });

    test('edit keeps pointer failure ahead of invalid document and replacement effects', () => {
      const events = [];
      const sentinel = new TypeError('pointer.startsWith sentinel');
      const document = new Proxy({}, {ownKeys() { events.push('document.ownKeys'); return []; }});
      const pointer = Object.defineProperty({}, 'startsWith', {get() { events.push('pointer.startsWith'); throw sentinel; }});
      let expected;
      try { sourceEditJsonSchemaNode(document, pointer, '{'); } catch (error) { expected = error; }
      expect(expected).toBe(sentinel);
      expect(events).toEqual(['pointer.startsWith']);

      events.length = 0;
      let dispatches = 0;
      let preflights = 0;
      const api = factory(() => { dispatches++; throw new Error('edit dispatch must not run'); }, () => { preflights++; return {}; });
      let actual;
      try { api.editJsonSchemaNode(document, pointer, '{'); } catch (error) { actual = error; }
      expect(actual).toBe(sentinel);
      expect(events).toEqual(['pointer.startsWith']);
      expect(preflights).toBe(0);
      expect(dispatches).toBe(0);
    });

    test('edit returns the source-equivalent pointer TypeError before touching crossed invalid inputs', () => {
      const events = [];
      const document = new Proxy({}, {ownKeys() { events.push('document.ownKeys'); return []; }});
      const pointer = 7;
      let expected;
      try { sourceEditJsonSchemaNode(document, pointer, '{'); } catch (error) { expected = error; }
      expect(expected).toBeInstanceOf(TypeError);
      expect(events).toEqual([]);

      let dispatches = 0;
      let preflights = 0;
      const api = factory(() => { dispatches++; return true; }, () => { preflights++; return {}; });
      let actual;
      try { api.editJsonSchemaNode(document, pointer, '{'); } catch (error) { actual = error; }
      expect(actual).toBeInstanceOf(TypeError);
      expect(actual.message).toBe(expected.message);
      expect(events).toEqual([]);
      expect(preflights).toBe(0);
      expect(dispatches).toBe(0);
    });

    test('matches method-bearing pointer TypeError before preflight and wire admission', () => {
      const events = [];
      const pointer = {startsWith(prefix) { events.push(`startsWith:${prefix}`); return true; }};
      const document = new Proxy({}, {ownKeys() { events.push('document.ownKeys'); return []; }});
      let referenceError;
      try { sourceEditJsonSchemaNode(document, pointer, '{'); } catch (error) { referenceError = error; }
      expect(referenceError).toBeInstanceOf(TypeError);
      expect(referenceError.message).toMatch(/pointer\.slice/);
      expect(events).toEqual(['startsWith:/']);

      events.length = 0;
      let preflights = 0;
      let dispatches = 0;
      const api = factory((_op, fields) => { dispatches++; return encodeWire(fields); }, () => { preflights++; return {}; });
      let candidateError;
      try { api.editJsonSchemaNode(document, pointer, '{'); } catch (error) { candidateError = error; }
      expect(candidateError).toBeInstanceOf(TypeError);
      expect(candidateError.message).toBe(referenceError.message);
      expect(events).toEqual(['startsWith:/']);
      expect(preflights).toBe(0);
      expect(dispatches).toBe(0);
    });
  });
}

describe('JSON Schema binding error compatibility', () => {
  test('uses UmfError for semantic refusals and preserves control error class and fields', () => {
    class ControlError extends Error { constructor(code, message, path) { super(message); Object.assign(this, {code, path}); } }
    const semantic = jsonSchemaFailureError({code: 'JSON_SCHEMA_URI', message: 'Invalid base URI', path: '/baseUri'}, ControlError);
    expect(semantic.name).toBe('UmfError');
    expect(semantic).toBeInstanceOf(UmfError);
    expect([semantic.code, semantic.message, semantic.path]).toEqual(['JSON_SCHEMA_URI', 'Invalid base URI', '/baseUri']);
    const control = jsonSchemaFailureError({code: 'RESOURCE_LIMIT', message: 'Host work budget exceeded', path: '/resources'}, ControlError);
    expect(control).toBeInstanceOf(ControlError);
    expect([control.code, control.message, control.path]).toEqual(['RESOURCE_LIMIT', 'Host work budget exceeded', '/resources']);
  });
});

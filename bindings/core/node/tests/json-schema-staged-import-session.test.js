import {describe, expect, test} from 'bun:test';
import {encodeWire} from '../src/wire.js';
import {createJsonSchemaStagedImportSession} from '../src/json-schema-import-session.js';

function fakeAddon({failStage} = {}) {
  const stages = [];
  const requests = [];
  class Session {
    executeStage(requestText) {
      const {members} = JSON.parse(requestText);
      const object = Object.fromEntries(members.map(({key, value}) => [String.fromCharCode(...key), value.kind === 'string' ? String.fromCharCode(...value.units) : value]));
      stages.push(object.stage);
      requests.push(object);
      if (object.stage === failStage) {
        const units = text => Array.from(text, c => c.charCodeAt(0));
        return JSON.stringify({profile: 'umf.core-wire/1', status: 'error', code: 'JSON_PARSE', pathUnits: [], messageUnits: units('Invalid JSON')});
      }
      return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: encodeWire(object.stage === 'finish' ? {id: 'result'} : true)});
    }
  }
  return {addon: {JsonSchemaImportSessionHandle: Session, jsonSchemaImportSessionProfileVersion: () => 'umf-r8-json-schema-staged-node-private/0.1.0'}, stages, requests};
}

describe('private staged JSON Schema import session', () => {
  test('preserves source ordered option reads and snapshots resource accessors before parsing', () => {
    const {addon, stages} = fakeAddon();
    const events = [];
    let baseReads = 0;
    const resources = {};
    Object.defineProperty(resources, 'https://example.test/r', {enumerable: true, get() { events.push('resource:get'); return '{}'; }});
    const options = {
      get baseUri() { events.push(`base:${++baseReads}`); return 'https://example.test/base'; },
      get resources() { events.push('resources'); return resources; },
      get id() { events.push('id'); return 'schema'; },
    };
    const result = createJsonSchemaStagedImportSession(addon).importJsonSchema('{}', options);
    expect(result).toEqual({id: 'result'});
    expect(events).toEqual(['base:1', 'resources', 'resource:get', 'base:2', 'id', 'base:3']);
    expect(stages).toEqual(['begin', 'resource', 'payloadBaseUri', 'root', 'id', 'namespace', 'finish']);
  });

  test('resource parse refusal prevents later URI checks and root parsing after entries snapshot', () => {
    const {addon, stages} = fakeAddon({failStage: 'resource'});
    const events = [];
    const resources = {};
    Object.defineProperty(resources, 'https://example.test/first', {enumerable: true, get() { events.push('get:first'); return '{'; }});
    Object.defineProperty(resources, 'relative-second', {enumerable: true, get() { events.push('get:second'); return '{}'; }});
    const options = {baseUri: 'https://example.test/base', resources};
    expect(() => createJsonSchemaStagedImportSession(addon).importJsonSchema('{', options)).toThrow('Invalid JSON');
    expect(events).toEqual(['get:first', 'get:second']);
    expect(stages).toEqual(['begin', 'resource']);
  });

  test('native getter exceptions escape unchanged before later host actions', () => {
    const {addon, stages} = fakeAddon();
    const sentinel = new Error('resources getter');
    const options = {baseUri: 'https://example.test/base', get resources() { throw sentinel; }};
    let caught;
    try { createJsonSchemaStagedImportSession(addon).importJsonSchema('{}', options); } catch (error) { caught = error; }
    expect(caught).toBe(sentinel);
    expect(stages).toEqual(['begin']);
  });

  test('invalid resource URI refuses before its Rust parse stage', () => {
    const {addon, stages} = fakeAddon();
    expect(() => createJsonSchemaStagedImportSession(addon).importJsonSchema('{}', {
      baseUri: 'https://example.test/base', resources: {'relative': '{'},
    })).toThrow('Retrieval URI must be absolute and fragment-free');
    expect(stages).toEqual(['begin']);
  });
});

  test('rejects a non-string first URI observation before Rust dispatch', () => {
    const {addon, stages} = fakeAddon();
    const boxed = new String('https://example.test/base');
    expect(() => createJsonSchemaStagedImportSession(addon).importJsonSchema('{}', {baseUri: boxed}))
      .toThrow('Staged JSON Schema import accepts a string baseUri');
    expect(stages).toEqual([]);
  });

  if (process.env.UMF_NODE_ADDON_PATH) {
    test('executes the staged request through the compiled native addon', () => {
      const {createRequire} = require('node:module');
      const nativeRequire = createRequire(import.meta.url);
      const addon = nativeRequire(process.env.UMF_NODE_ADDON_PATH);
      const api = createJsonSchemaStagedImportSession(addon);
      const document = api.importJsonSchema('{"type":"string"}', {
        id: 'staged-native', baseUri: 'https://example.test/schema',
        resources: {'https://example.test/resource': '{"type":"number"}'},
      });
      expect(document.id).toBe('staged-native');
      let idRead = false;
      let parseError;
      try { api.importJsonSchema('{', {
        baseUri: 'https://example.test/schema',
        resources: {'https://example.test/resource': '{'},
        get id() { idRead = true; return 'unreachable'; },
      }); } catch (error) { parseError = error; }
      expect(parseError.code).toBe('JSON_SCHEMA_SYNTAX');
      expect(idRead).toBe(false);
    });
  }

test('fails closed when the Node addon profile version differs', () => {
  const {addon} = fakeAddon();
  addon.jsonSchemaImportSessionProfileVersion = () => 'other-profile';
  expect(() => createJsonSchemaStagedImportSession(addon)).toThrow('RUST_NODE_BINDING_PROFILE_MISMATCH');
});

test('preserves a control-failure envelope as a coded error', () => {
  const {addon} = fakeAddon({failStage: 'begin'});
  const OriginalSession = addon.JsonSchemaImportSessionHandle;
  addon.JsonSchemaImportSessionHandle = class extends OriginalSession {
    executeStage(requestText) {
      const envelope = JSON.parse(super.executeStage(requestText));
      if (envelope.status === 'error') envelope.code = 'RESOURCE_LIMIT';
      return JSON.stringify(envelope);
    }
  };
  expect(() => createJsonSchemaStagedImportSession(addon).importJsonSchema('{}', {
    baseUri: 'https://example.test/base',
  })).toThrow(expect.objectContaining({code: 'RESOURCE_LIMIT'}));
});

test('private host-coercion profile keeps ToString effects in order and Rust parse before YAML type refusal', () => {
  const {addon, stages, requests} = fakeAddon();
  const events = [];
  const input = Object.defineProperties({}, {
    length: {get() { events.push('length'); return 2; }},
    [Symbol.toPrimitive]: {value(hint) { events.push(`toPrimitive:${hint}`); return '{}'; }},
  });
  expect(() => createJsonSchemaStagedImportSession(addon).importJsonSchemaHostCoercion(input, {
    id: 'host-coercion', baseUri: 'https://example.test/root', resources: {},
  })).toThrow(new TypeError('source is not a string'));
  expect(events).toEqual(['length', 'toPrimitive:string', 'length']);
  expect(stages).toEqual(['begin', 'payloadBaseUri', 'root']);
  expect(requests.find(request => request.stage === 'root').source).toBe('{}');
});

test('private host-coercion profile lets Rust syntax refusal stop before the second length read', () => {
  const {addon, stages} = fakeAddon({failStage: 'root'});
  const events = [];
  const input = Object.defineProperties({}, {
    length: {get() { events.push('length'); return 2; }},
    toString: {value() { events.push('toString'); return '{'; }},
  });
  expect(() => createJsonSchemaStagedImportSession(addon).importJsonSchemaHostCoercion(input, {
    id: 'host-coercion', baseUri: 'https://example.test/root', resources: {},
  })).toThrow('Invalid JSON');
  expect(events).toEqual(['length', 'toString']);
  expect(stages).toEqual(['begin', 'payloadBaseUri', 'root']);
});

test('private host-coercion profile maps native ToString failure to Rust syntax refusal', () => {
  const {addon, requests} = fakeAddon({failStage: 'root'});
  const input = Object.defineProperties({}, {
    length: {get() { return 2; }},
    [Symbol.toPrimitive]: {value() { throw new Error('coercion is caught by source JSON.parse'); }},
  });
  expect(() => createJsonSchemaStagedImportSession(addon).importJsonSchemaHostCoercion(input, {
    id: 'host-coercion', baseUri: 'https://example.test/root', resources: {},
  })).toThrow('Invalid JSON');
  expect(requests.find(request => request.stage === 'root').source).toBe('{');
});

test('private host-coercion profile fails closed above its declared length bound', () => {
  const {addon, stages} = fakeAddon();
  const input = Object.defineProperties({}, {
    length: {get() { return 4_000_001; }},
    toString: {value() { throw new Error('must not coerce'); }},
  });
  expect(() => createJsonSchemaStagedImportSession(addon).importJsonSchemaHostCoercion(input, {
    id: 'host-coercion', baseUri: 'https://example.test/root', resources: {},
  })).toThrow(expect.objectContaining({code: 'JSON_SCHEMA_HOST_INPUT_PROFILE'}));
  expect(stages).toEqual(['begin', 'payloadBaseUri']);
});

test('default private staged method retains its string-only admission', () => {
  const {addon, stages} = fakeAddon();
  expect(() => createJsonSchemaStagedImportSession(addon).importJsonSchema({}, {
    id: 'host-coercion', baseUri: 'https://example.test/root', resources: {},
  })).toThrow('Staged JSON Schema import accepts a string root source');
  expect(stages).toEqual(['begin', 'payloadBaseUri']);
});

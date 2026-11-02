import {describe, expect, test} from 'bun:test';
import {pathToFileURL} from 'node:url';

const packagePath = process.env.UMF_PROTOBUF_SOURCE_IMPORT_PACKAGE;
if (!packagePath) throw new Error('Set UMF_PROTOBUF_SOURCE_IMPORT_PACKAGE to the isolated fresh Node package');
const {createProtobufSourceImportEngine} = await import(pathToFileURL(`${packagePath}/index.js`).href);
const input = () => ({files: {'root.proto': 'syntax = "proto3";\nmessage A {}\n'}, roots: ['root.proto']});
const sourceOptions = (events) => ({get id() { events.push('id'); return 'capture'; }});

describe('R8 Protobuf source import host boundary', () => {
  test('retains an isolated source archive and calls the compiler with one argument', async () => {
    const engine = createProtobufSourceImportEngine();
    let compilerArity;
    const result = await engine.importProtobufSources(input(), {
      async compile(request) {
        compilerArity = arguments.length;
        request.files['root.proto'] = 'mutated by compiler';
        return {descriptorSet: new Uint8Array(), compiler: 'protoc'};
      },
    }, {id: 'capture'});
    const archive = result.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive;
    expect(engine.callbackControl).toBe('boundary-only');
    expect(compilerArity).toBe(1);
    expect(archive.files['root.proto']).toBe('syntax = "proto3";\nmessage A {}\n');
    expect(archive.roots).toEqual(['root.proto']);
  });

  test('reads compiler, descriptor, id, decodes, then reads compiler for the archive', async () => {
    const engine = createProtobufSourceImportEngine();
    const events = [];
    let compilerReads = 0;
    const result = await engine.importProtobufSources(input(), {
      async compile() {
        events.push('callback');
        return Object.defineProperties({}, {
          compiler: {get() { compilerReads++; events.push(`compiler-${compilerReads}`); return 'protoc'; }},
          descriptorSet: {get() { events.push('descriptor'); return new Uint8Array(); }},
        });
      },
    }, sourceOptions(events));
    expect(events).toEqual(['callback', 'compiler-1', 'descriptor', 'id', 'compiler-2']);
    expect(compilerReads).toBe(2);
    expect(result.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive.compiler).toBe('protoc');
  });

  test('preserves the predecessor diagnostic when the second compiler read is non-string', async () => {
    const engine = createProtobufSourceImportEngine();
    let reads = 0;
    const marker = '[{"code":"EXTENSION_STRUCTURE","path":"/modules/0/elements/0/extensions/umf.protobuf/sourceArchive/compiler","message":"must be string","severity":"error"}]';
    await expect(engine.importProtobufSources(input(), {
      async compile() {
        return Object.defineProperties({}, {
          compiler: {get() { reads++; return reads === 1 ? 'protoc' : 123; }},
          descriptorSet: {get() { return new Uint8Array(); }},
        });
      },
    }, {id: 'capture'})).rejects.toMatchObject({code: 'PROTOBUF_SOURCE', message: marker});
    expect(reads).toBe(2);
  });

  test('does not reflect nested properties when the second compiler value is an object', async () => {
    const engine = createProtobufSourceImportEngine();
    const marker = '[{"code":"EXTENSION_STRUCTURE","path":"/modules/0/elements/0/extensions/umf.protobuf/sourceArchive/compiler","message":"must be string","severity":"error"}]';
    let reads = 0;
    let nestedReads = 0;
    await expect(engine.importProtobufSources(input(), {
      async compile() {
        return Object.defineProperties({}, {
          compiler: {get() { reads++; return reads === 1 ? 'protoc' : {get hostile() { nestedReads++; return true; }}; }},
          descriptorSet: {get() { return new Uint8Array(); }},
        });
      },
    }, {id: 'capture'})).rejects.toMatchObject({code: 'PROTOBUF_SOURCE', message: marker});
    expect(reads).toBe(2);
    expect(nestedReads).toBe(0);
  });

  test('preserves callback rejection identity and does not read options.id', async () => {
    const engine = createProtobufSourceImportEngine();
    const rejection = new Error('compiler refused');
    let idRead = false;
    await expect(engine.importProtobufSources(input(), {compile() { return Promise.reject(rejection); }}, {
      get id() { idRead = true; return 'capture'; },
    })).rejects.toBe(rejection);
    expect(idRead).toBe(false);
  });

  test('a second compiler getter exception escapes by identity after descriptor admission', async () => {
    const engine = createProtobufSourceImportEngine();
    const marker = new Error('second compiler read');
    let reads = 0;
    const events = [];
    await expect(engine.importProtobufSources(input(), {
      async compile() {
        return Object.defineProperties({}, {
          compiler: {get() { reads++; events.push(`compiler-${reads}`); if (reads === 2) throw marker; return 'protoc'; }},
          descriptorSet: {get() { events.push('descriptor'); return new Uint8Array(); }},
        });
      },
    }, sourceOptions(events))).rejects.toBe(marker);
    expect(events).toEqual(['compiler-1', 'descriptor', 'id', 'compiler-2']);
  });

  test('public request accessors are refused before callback dispatch', async () => {
    const engine = createProtobufSourceImportEngine();
    let reads = 0;
    let callbacks = 0;
    const hostile = input();
    Object.defineProperty(hostile, 'future', {enumerable: true, get() { reads++; return true; }});
    await expect(engine.importProtobufSources(hostile, {compile() { callbacks++; }}, {id: 'capture'}))
      .rejects.toMatchObject({code: 'NON_JSON'});
    expect(reads).toBe(0);
    expect(callbacks).toBe(0);
  });

  test('maxWork preflight refuses before reflecting a hostile request', async () => {
    const engine = createProtobufSourceImportEngine({controls: {maxWork: 0}});
    let getterReads = 0;
    let callbacks = 0;
    const hostile = {get files() { getterReads++; return {}; }, roots: ['root.proto']};
    await expect(engine.importProtobufSources(hostile, {compile() { callbacks++; }}, {id: 'capture'}))
      .rejects.toMatchObject({code: 'RESOURCE_LIMIT'});
    expect(getterReads).toBe(0);
    expect(callbacks).toBe(0);
  });

  test('snapshots accepted nonzero-offset byte views through typed-array intrinsics', async () => {
    const engine = createProtobufSourceImportEngine();
    let byteLengthReads = 0;
    let iteratorReads = 0;
    class HostileBytes extends Uint8Array {
      get byteLength() { byteLengthReads++; throw new Error('byteLength getter'); }
      [Symbol.iterator]() { iteratorReads++; throw new Error('iterator'); }
    }
    const storage = new Uint8Array([0xff, 0x0a, 0x00, 0xff]);
    const bytes = new HostileBytes(storage.buffer, 1, 2);
    const result = await engine.importProtobufSources(input(), {
      async compile() { return {descriptorSet: bytes, compiler: 'protoc'}; },
    }, {id: 'capture'});
    expect(result.id).toBe('capture');
    expect(byteLengthReads).toBe(0);
    expect(iteratorReads).toBe(0);
  });

  test('refuses descriptor input above 4 MB after callback result and options id reads', async () => {
    const engine = createProtobufSourceImportEngine();
    const events = [];
    const large = new Uint8Array(4_000_001);
    await expect(engine.importProtobufSources(input(), {
      async compile() { events.push('callback'); return {descriptorSet: large, compiler: 'protoc'}; },
    }, {get id() { events.push('id'); return 'capture'; }})).rejects.toMatchObject({code: 'LIMIT'});
    expect(events).toEqual(['callback', 'id']);
  });
});

import {describe, expect, test} from 'bun:test';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {exportProtobufSources as predecessorExportProtobufSources} from '../../src/adapters/protobuf/source.ts';

const packagePath = process.env.UMF_PROTOBUF_SOURCE_EXPORT_PACKAGE;
if (!packagePath) throw new Error('Set UMF_PROTOBUF_SOURCE_EXPORT_PACKAGE to the isolated fresh Node package');
const {createProtobufDescriptorDocumentEngine, createProtobufSourceExportEngine} = await import(pathToFileURL(`${packagePath}/index.js`).href);

function hash(value) { return createHash('sha256').update(value).digest('hex'); }

function document() {
  const value = createProtobufDescriptorDocumentEngine().importProtobufDescriptorSet(new Uint8Array(), {id: 'source-export'});
  value.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive = {
    role: 'original', compiler: 'protoc/36.2', files: {'root.proto': 'syntax = "proto3";\n'}, roots: ['root.proto'],
  };
  return value;
}

const emitterResult = () => ({files: {'root.proto': 'syntax = "proto3";\n'}, compiler: 'protoc/36.2', printer: 'protoc/36.2', future: {opaque: true}});

describe('R8 Protobuf source export host boundary', () => {
  test('replays every frozen R5 predecessor outcome through Node', async () => {
    const fixtureBytes = new Uint8Array(await readFile(new URL('../../fixtures/protobuf/authored.pb', import.meta.url)));
    const makeSeed = () => {
      const descriptor = createProtobufDescriptorDocumentEngine();
      const source = descriptor.importProtobufDescriptorSet(new Uint8Array(), {id: 'source-export-capture'});
      source.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive = {
        role: 'original', compiler: 'capture-compiler/1',
        files: {
          'root.proto': 'syntax = "proto3";\nmessage A { string label = 1; }\n',
          'unicode-😀.proto': 'message B { string note = 1; }\n',
        }, roots: ['root.proto'],
      };
      const edited = descriptor.importProtobufDescriptorSet(fixtureBytes, {id: 'edited-descriptor'});
      source.modules[0].elements[0].extensions['umf.protobuf'].descriptorSet =
        structuredClone(edited.modules[0].elements[0].extensions['umf.protobuf'].descriptorSet);
      return source;
    };
    const run = async (which, name) => {
      const source = makeSeed();
      const exportSources = which === 'predecessor'
        ? predecessorExportProtobufSources
        : createProtobufSourceExportEngine().exportProtobufSources;
      const owner = which === 'predecessor' ? undefined : createProtobufSourceExportEngine();
      const invoke = (input, emitter) => which === 'predecessor'
        ? exportSources(input, emitter)
        : owner.exportProtobufSources(input, emitter);
      let calls = 0;
      let callbackDescriptorBytes;
      const snapshot = async (input, emitter) => {
        try {
          const output = await invoke(input, emitter);
          return {ok: true, output};
        } catch (error) {
          return {ok: false, error: {code: error?.code ?? null, message: error?.message ?? String(error), path: error?.path ?? null}};
        }
      };
      const validEmitter = {async emit(bytes) { calls++; callbackDescriptorBytes = {sha256: hash(bytes), byteLength: bytes.byteLength}; return {files: {'generated.proto': 'message Edited {}\n'}, compiler: 'capture-compiler/1', printer: 'capture-printer/1'}; }};
      let input = source;
      let emitter = validEmitter;
      let post = value => value;
      switch (name) {
        case 'invalid-document-before-emitter': input = {}; break;
        case 'invalid-emitter-null-result': emitter = {async emit(bytes) { calls++; callbackDescriptorBytes = {sha256: hash(bytes), byteLength: bytes.byteLength}; return null; }}; break;
        case 'invalid-emitter-missing-files': emitter = {async emit(bytes) { calls++; callbackDescriptorBytes = {sha256: hash(bytes), byteLength: bytes.byteLength}; return {compiler: 'c', printer: 'p'}; }}; break;
        case 'invalid-emitter-array-files': emitter = {async emit(bytes) { calls++; callbackDescriptorBytes = {sha256: hash(bytes), byteLength: bytes.byteLength}; return {files: [], compiler: 'c', printer: 'p'}; }}; break;
        case 'invalid-emitter-missing-compiler': emitter = {async emit(bytes) { calls++; callbackDescriptorBytes = {sha256: hash(bytes), byteLength: bytes.byteLength}; return {files: {}, printer: 'p'}; }}; break;
        case 'invalid-emitter-missing-printer': emitter = {async emit(bytes) { calls++; callbackDescriptorBytes = {sha256: hash(bytes), byteLength: bytes.byteLength}; return {files: {}, compiler: 'c'}; }}; break;
        case 'invalid-emitter-empty-name': emitter = {async emit(bytes) { calls++; callbackDescriptorBytes = {sha256: hash(bytes), byteLength: bytes.byteLength}; return {files: {'': 'x'}, compiler: 'c', printer: 'p'}; }}; break;
        case 'invalid-emitter-non-string-source': emitter = {async emit(bytes) { calls++; callbackDescriptorBytes = {sha256: hash(bytes), byteLength: bytes.byteLength}; return {files: {'a.proto': 7}, compiler: 'c', printer: 'p'}; }}; break;
        case 'invalid-emitter-unknown-emitter-field': emitter = {async emit(bytes) { calls++; callbackDescriptorBytes = {sha256: hash(bytes), byteLength: bytes.byteLength}; return {files: {}, compiler: 'c', printer: 'p', future: {keep: true}}; }}; break;
        case 'invalid-emitter-copy-number-precedence': emitter = {async emit() { return {files: {}, compiler: 'c', printer: 'p', future: Number.NaN}; }}; break;
        case 'callback-mutates-document-before-source-copy': emitter = {async emit(bytes) { calls++; callbackDescriptorBytes = {sha256: hash(bytes), byteLength: bytes.byteLength}; source.id = 'after callback'; source.modules[0].elements[0].extensions['umf.protobuf'].futureRepresentation = {retain: true}; return {files: {'generated.proto': 'message Edited {}\n'}, compiler: 'capture-compiler/1', printer: 'capture-printer/1'}; }}; break;
        case 'unknown-payload-field-before-emitter': source.modules[0].elements[0].extensions['umf.protobuf'].futureRepresentation = {retain: true}; break;
        case 'unknown-source-archive-field-before-emitter': source.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive.futureArchiveField = {retain: true}; break;
        default: break;
      }
      const outcome = await snapshot(input, emitter);
      if (!outcome.ok) return {result: outcome.error, calls, ...(callbackDescriptorBytes ? {callbackDescriptorBytes} : {})};
      const output = outcome.output;
      if (name === 'edited-current-descriptor-and-original-archive') {
        output.files['generated.proto'] = 'mutated after callback';
        return {result: {ok: true, calls, descriptorBytesToEmitter: callbackDescriptorBytes,
          output: {files: {'generated.proto': 'message Edited {}\n'}, compiler: output.compiler, printer: output.printer,
            archive: output.source.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive,
            sourceId: output.source.id, inputIdAfterReturnMutation: source.id,
            diagnosticCodes: output.diagnostics.map(item => item.code), layoutDiagnostic: output.diagnostics.at(-1)}}};
      }
      if (name === 'invalid-emitter-unknown-emitter-field') return {result: {ok: true, files: output.files, compiler: output.compiler, printer: output.printer,
        unknownFields: Object.keys(output).filter(key => !['files', 'compiler', 'printer', 'source', 'diagnostics'].includes(key)),
        archive: output.source.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive,
        diagnosticCodes: output.diagnostics.map(item => item.code)}, callbackDescriptorBytes};
      if (name === 'callback-mutates-document-before-source-copy') return {result: {ok: true, descriptorBytesToEmitter: callbackDescriptorBytes,
        sourceId: output.source.id, sourceUnknownPayload: output.source.modules[0].elements[0].extensions['umf.protobuf'].futureRepresentation,
        diagnosticCodes: output.diagnostics.map(item => item.code)}};
      return {result: {ok: true, files: output.files, compiler: output.compiler, printer: output.printer}, calls,
        ...(callbackDescriptorBytes ? {callbackDescriptorBytes} : {})};
    };
    const names = [
      'edited-current-descriptor-and-original-archive', 'invalid-document-before-emitter',
      'invalid-emitter-null-result', 'invalid-emitter-missing-files', 'invalid-emitter-array-files',
      'invalid-emitter-missing-compiler', 'invalid-emitter-missing-printer', 'invalid-emitter-empty-name',
      'invalid-emitter-non-string-source', 'invalid-emitter-unknown-emitter-field',
      'invalid-emitter-copy-number-precedence', 'callback-mutates-document-before-source-copy',
      'unknown-payload-field-before-emitter', 'unknown-source-archive-field-before-emitter',
    ];
    const results = [];
    for (const name of names) {
      const expected = await run('predecessor', name);
      const actual = await run('rust', name);
      results.push({name, expected, actual});
      expect(actual).toEqual(expected);
    }
    expect(results).toHaveLength(14);
  }, 120_000);

  test('prepares current bytes, calls one-argument emitter, and retains source archive and unknown result fields', async () => {
    const engine = createProtobufSourceExportEngine();
    const source = document();
    const expectedBytes = createProtobufDescriptorDocumentEngine().exportProtobufDescriptorSet(source);
    let arity;
    let emitted;
    const output = await engine.exportProtobufSources(source, {
      async emit(bytes) {
        arity = arguments.length;
        emitted = new Uint8Array(bytes);
        source.id = 'mutated during callback';
        return emitterResult();
      },
    });
    expect(arity).toBe(1);
    expect(Array.from(emitted)).toEqual(Array.from(expectedBytes));
    expect(output.future).toEqual({opaque: true});
    expect(output.source.id).toBe('mutated during callback');
    expect(output.source.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive.files['root.proto'])
      .toBe('syntax = "proto3";\n');
  });

  test('runs inspection copy before original document property reads', async () => {
    const engine = createProtobufSourceExportEngine();
    const events = [];
    const source = new Proxy(document(), {
      get(target, key, receiver) {
        if (key === 'modules' || key === 'vocabularies') events.push(String(key));
        return Reflect.get(target, key, receiver);
      },
    });
    await engine.exportProtobufSources(source, {async emit() { return emitterResult(); }});
    expect(events).toEqual(['modules', 'vocabularies']);
  });

  test('reports a selected payload change after initial document inspection as PROTOBUF_PAYLOAD', async () => {
    const engine = createProtobufSourceExportEngine();
    const source = document();
    const element = source.modules[0].elements[0];
    const originalExtensions = element.extensions;
    element.extensions = new Proxy(originalExtensions, {
      get(target, key, receiver) {
        if (key === 'umf.protobuf') return null;
        return Reflect.get(target, key, receiver);
      },
    });
    await expect(engine.exportProtobufSources(source, {async emit() { throw new Error('must not dispatch'); }}))
      .rejects.toMatchObject({code: 'PROTOBUF_PAYLOAD'});
  });

  test('holds schema-valid but writer-invalid selected payload error mapping', async () => {
    const engine = createProtobufSourceExportEngine();
    const source = document();
    const originalPayload = source.modules[0].elements[0].extensions['umf.protobuf'];
    const invalidPayload = structuredClone(originalPayload);
    invalidPayload.descriptorSet.unknown = [{number: 1, wireType: 2, data: 'ff'}];
    const element = source.modules[0].elements[0];
    element.extensions = new Proxy(element.extensions, {
      get(target, key, receiver) {
        if (key === 'umf.protobuf') return invalidPayload;
        return Reflect.get(target, key, receiver);
      },
    });
    let predecessorError;
    try {
      await predecessorExportProtobufSources(source, {async emit() { throw new Error('must not dispatch'); }});
    } catch (error) {
      predecessorError = error;
    }
    let rustError;
    try {
      await engine.exportProtobufSources(source, {async emit() { throw new Error('must not dispatch'); }});
    } catch (error) {
      rustError = error;
    }
    expect(predecessorError).toBeDefined();
    expect(rustError).toBeDefined();
    // Draft 2020-12 payload structure admission is a distinct checkpoint from
    // descriptor writing, so this shape reaches the same writer refusal.
    expect(rustError.code).toBe(predecessorError.code);
    expect(rustError.message).toBe(predecessorError.message);
  });

  test('rejects an unknown archive field only after selected-payload schema admission', async () => {
    const engine = createProtobufSourceExportEngine();
    const source = document();
    const invalidPayload = structuredClone(source.modules[0].elements[0].extensions['umf.protobuf']);
    invalidPayload.sourceArchive.future = {opaque: true};
    const element = source.modules[0].elements[0];
    element.extensions = new Proxy(element.extensions, {
      get(target, key, receiver) {
        if (key === 'umf.protobuf') return invalidPayload;
        return Reflect.get(target, key, receiver);
      },
    });
    let predecessorError;
    try {
      await predecessorExportProtobufSources(source, {async emit() { throw new Error('must not dispatch'); }});
    } catch (error) {
      predecessorError = error;
    }
    let rustError;
    try {
      await engine.exportProtobufSources(source, {async emit() { throw new Error('must not dispatch'); }});
    } catch (error) {
      rustError = error;
    }
    expect(predecessorError).toBeDefined();
    expect(rustError).toBeDefined();
    expect(predecessorError.code).toBe('PROTOBUF_REPRESENTATION');
    expect(rustError.code).toBe('PROTOBUF_REPRESENTATION');
  });

  test('admits emitter result before copying the post-callback document', async () => {
    const engine = createProtobufSourceExportEngine();
    const source = document();
    let lateGetterReads = 0;
    await expect(engine.exportProtobufSources(source, {
      async emit() {
        Object.defineProperty(source, 'late', {enumerable: true, get() { lateGetterReads++; return true; }});
        return {files: [], compiler: 'protoc/36.2', printer: 'protoc/36.2'};
      },
    })).rejects.toMatchObject({code: 'PROTOBUF_EMIT'});
    expect(lateGetterReads).toBe(0);
  });

  test('preserves rejected emitter identity and does not read post-callback document', async () => {
    const engine = createProtobufSourceExportEngine();
    const source = document();
    const rejection = new Error('emitter refused');
    let lateGetterReads = 0;
    await expect(engine.exportProtobufSources(source, {
      emit() {
        Object.defineProperty(source, 'late', {enumerable: true, get() { lateGetterReads++; return true; }});
        return Promise.reject(rejection);
      },
    })).rejects.toBe(rejection);
    expect(lateGetterReads).toBe(0);
  });

  test('keeps replaced Array.prototype.find behavior explicitly outside the qualified subset', async () => {
    const engine = createProtobufSourceExportEngine();
    const source = document();
    const originalFind = Array.prototype.find;
    let invocations = 0;
    Array.prototype.find = function(callback, thisArg) {
      invocations++;
      return Reflect.apply(originalFind, this, [callback, thisArg]);
    };
    try {
      await engine.exportProtobufSources(source, {async emit() { return emitterResult(); }});
      // The Rust-driven profile reads `.find` as a host property but currently
      // performs bounded dense-array traversal itself. The predecessor invokes
      // the selected method, so a replaced global method remains a named gap.
      expect(invocations).toBe(0);
    } finally {
      Array.prototype.find = originalFind;
    }
  });
});

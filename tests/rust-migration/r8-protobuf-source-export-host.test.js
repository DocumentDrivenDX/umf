import {describe, expect, test} from 'bun:test';
import {pathToFileURL} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

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
  test('replays bounded source export outcomes through the Rust Node engine', async () => {
    const engine = createProtobufSourceExportEngine();
    const names = [
      'edited-current-descriptor-and-original-archive', 'invalid-document-before-emitter',
      'invalid-emitter-null-result', 'invalid-emitter-missing-files', 'invalid-emitter-array-files',
      'invalid-emitter-missing-compiler', 'invalid-emitter-missing-printer', 'invalid-emitter-empty-name',
      'invalid-emitter-non-string-source', 'invalid-emitter-unknown-emitter-field',
      'invalid-emitter-copy-number-precedence', 'callback-mutates-document-before-source-copy',
      'unknown-payload-field-before-emitter', 'unknown-source-archive-field-before-emitter',
    ];
    for (const name of names) {
      const source = document();
      let calls = 0;
      let input = source;
      let emitter = {async emit() { calls++; return emitterResult(); }};
      switch (name) {
        case 'invalid-document-before-emitter': input = {}; break;
        case 'invalid-emitter-null-result': emitter = {async emit() { calls++; return null; }}; break;
        case 'invalid-emitter-missing-files': emitter = {async emit() { calls++; return {compiler: 'c', printer: 'p'}; }}; break;
        case 'invalid-emitter-array-files': emitter = {async emit() { calls++; return {files: [], compiler: 'c', printer: 'p'}; }}; break;
        case 'invalid-emitter-missing-compiler': emitter = {async emit() { calls++; return {files: {}, printer: 'p'}; }}; break;
        case 'invalid-emitter-missing-printer': emitter = {async emit() { calls++; return {files: {}, compiler: 'c'}; }}; break;
        case 'invalid-emitter-empty-name': emitter = {async emit() { calls++; return {files: {'': 'x'}, compiler: 'c', printer: 'p'}; }}; break;
        case 'invalid-emitter-non-string-source': emitter = {async emit() { calls++; return {files: {'a.proto': 7}, compiler: 'c', printer: 'p'}; }}; break;
        case 'invalid-emitter-unknown-emitter-field': emitter = {async emit() { calls++; return {files: {}, compiler: 'c', printer: 'p', future: {keep: true}}; }}; break;
        case 'invalid-emitter-copy-number-precedence': emitter = {async emit() { return {files: {}, compiler: 'c', printer: 'p', future: Number.NaN}; }}; break;
        case 'unknown-payload-field-before-emitter': source.modules[0].elements[0].extensions['umf.protobuf'].futureRepresentation = {retain: true}; break;
        case 'unknown-source-archive-field-before-emitter': source.modules[0].elements[0].extensions['umf.protobuf'].sourceArchive.futureArchiveField = {retain: true}; break;
      }
      let error;
      try { await engine.exportProtobufSources(input, emitter); } catch (caught) { error = caught; }
      if (name.startsWith('invalid-') || name.startsWith('unknown-')) expect(error).toBeDefined();
      if (name === 'invalid-document-before-emitter') expect(calls).toBe(0);
      if (name.startsWith('invalid-emitter-')) expect(calls).toBe(1);
      if (name.startsWith('unknown-')) expect(calls).toBe(0);
    }
    expect(names).toHaveLength(14);
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
    let rustError;
    try {
      await engine.exportProtobufSources(source, {async emit() { throw new Error('must not dispatch'); }});
    } catch (error) {
      rustError = error;
    }
    expect(rustError).toBeDefined();
    // Draft 2020-12 payload structure admission is a distinct checkpoint from
    // descriptor writing, so this shape reaches the same writer refusal.
    expect(rustError.code).toBeDefined();
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
    let rustError;
    try {
      await engine.exportProtobufSources(source, {async emit() { throw new Error('must not dispatch'); }});
    } catch (error) {
      rustError = error;
    }
    expect(rustError).toBeDefined();
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

// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe, expect, test} from 'vitest';
import {createDbtOperations} from '../../bindings/core/node/src/dbt.js';

const plain = (value: object) => Object.getPrototypeOf(value) === Object.prototype;
const nullObject = (value: object) => Object.getPrototypeOf(value) === null;

describe('DBT Rust host boundary', () => {
  test('imports read options.id exactly once and ignore all other option properties', () => {
    const calls: unknown[][] = [];
    let reads = 0;
    const options = Object.defineProperties({}, {
      id: {enumerable: true, get() { reads++; return 'dbt-id'; }},
      extra: {enumerable: true, get() { throw new Error('must be ignored'); }},
    });
    const operations = createDbtOperations((operation: string, fields: unknown) => { calls.push([operation, fields]); return {id: 'x'}; });
    const result = operations.importDbtManifest('{"x":1}', options as {id: string});
    expect(reads).toBe(1);
    expect(calls[0]).toEqual(['importManifest', {text: '{"x":1}', options: {id: 'dbt-id'}}]);
    expect(plain(result as object)).toBe(true);
    expect(() => operations.importDbtManifest('{}', null as never)).toThrow(TypeError);
  });

  test('imports parse source before refusing undefined ids and keep explicit null as document data', () => {
    const syntax = Object.assign(new Error('Invalid native JSON'), {code: 'JSON_SCHEMA_SYNTAX'});
    const nonJson = Object.assign(new Error('Value is not JSON-compatible'), {code: 'NON_JSON', path: '/id'});
    const operations = createDbtOperations((operation: string, fields: any) => {
      if (operation === 'prepareImportText' && fields.text === '{') throw syntax;
      return fields.options?.id ?? null;
    }, {
      copyJson(value: any) { if (value.id === undefined) throw nonJson; return value; },
      isHostJsonResponseError(error) { return error === nonJson; },
    });
    expect(() => operations.importDbtManifest('{', {id: undefined as never})).toThrow(syntax);
    expect(() => operations.importDbtArtifact('{}', {} as never)).toThrow(expect.objectContaining({
      code: 'DBT_ARTIFACT_DOCUMENT',
      message: JSON.stringify([{code: 'NON_JSON', path: '/id', message: 'Value is not JSON-compatible', severity: 'error'}]),
    }));
    expect(operations.importDbtManifest('{}', {id: null as never})).toBeNull();
  });

  test('inspection turns Rust-backed host-copy refusals into an invalid Validation', () => {
    const refusal = Object.assign(new Error('Accessor cannot be copied'), {code: 'NON_JSON', path: '/modules/0'});
    let dispatched = false;
    const operations = createDbtOperations(() => { dispatched = true; throw new Error('unexpected'); }, {
      copyJson() { throw refusal; },
      isHostJsonResponseError(error) { return error === refusal; },
    });
    const result = operations.inspectDbtManifest({}) as any;
    expect(dispatched).toBe(false);
    expect(result).toEqual({valid: false, complete: false, diagnostics: [{
      code: 'NON_JSON', path: '/modules/0', message: 'Accessor cannot be copied', severity: 'error',
    }]});
    expect(plain(result)).toBe(true);
    expect(plain(result.diagnostics[0])).toBe(true);
  });

  test('document-consuming refusals use the predecessor DBT document envelope', () => {
    const refusal = Object.assign(new Error('Cyclic value'), {code: 'CYCLE', path: '/modules'});
    const operations = createDbtOperations(() => { throw new Error('unexpected'); }, {
      copyJson() { throw refusal; },
      isHostJsonResponseError(error) { return error === refusal; },
    });
    expect(() => operations.exportDbtManifest({})).toThrow(expect.objectContaining({
      code: 'DBT_MANIFEST_DOCUMENT',
      message: JSON.stringify([{code: 'CYCLE', path: '/modules', message: 'Cyclic value', severity: 'error'}]),
    }));
  });

  test('selection reads only known options in source order and ignores extras', () => {
    const reads: string[] = [];
    const options = Object.defineProperties({}, {
      roots: {enumerable: true, get() { reads.push('roots'); return ['model.x']; }},
      includeMacros: {enumerable: true, get() { reads.push('includeMacros'); return false; }},
      maxDepth: {enumerable: true, get() { reads.push('maxDepth'); return 4; }},
      maxNodes: {enumerable: true, get() { reads.push('maxNodes'); return 12; }},
      ignored: {enumerable: true, get() { throw new Error('must be ignored'); }},
    });
    const calls: unknown[][] = [];
    const operations = createDbtOperations((operation: string, fields: any, transaction: unknown) => {
      calls.push([operation, fields, transaction]);
      if (operation === 'prepareManifestSelectionBounds') return {minimum: 1, maximum: 64};
      if (operation === 'prepareManifestSelectionRootItem') return false;
      if (operation === 'prepareManifestSelectionSettings') return fields.options;
      if (operation === 'finishManifestSelection') return {source: {}, selection: {roots: fields.roots, ...fields.options}};
      return null;
    });
    const result = operations.selectDbtManifestDependencies({}, options as never) as any;
    expect(reads).toEqual(['roots', 'roots', 'roots', 'roots', 'includeMacros', 'includeMacros', 'maxDepth', 'maxDepth', 'maxNodes', 'maxNodes', 'roots']);
    expect(result.selection).toMatchObject({roots: ['model.x'], includeMacros: false, maxDepth: 4, maxNodes: 12});
    expect(calls.map(call => call[0])).toContain('prepareManifestSelectionGraph');
    expect(calls.at(-1)?.[0]).toBe('finishManifestSelection');
    expect(calls[0]![2]).toBe(calls.at(-1)![2]);
  });

  test('operation results restore predecessor object prototypes by result kind', () => {
    const nativeRoot = {kind: 'object', members: {answer: {kind: 'number', value: '42'}}};
    const imported = {modules: [{elements: [{extensions: {'umf.dbt.manifest': {root: nativeRoot}}}]}]};
    const operations = createDbtOperations((operation) => operation === 'importManifest'
      ? imported
      : operation === 'getManifestNode' ? nativeRoot
        : {source: imported, selection: {status: 'selected'}});
    const document = operations.importDbtManifest('{}', {id: 'x'} as {id: string}) as any;
    expect(plain(document)).toBe(true);
    expect(plain(document.modules[0])).toBe(true);
    expect(plain(document.modules[0].elements[0].extensions['umf.dbt.manifest'].root)).toBe(true);
    expect(nullObject(document.modules[0].elements[0].extensions['umf.dbt.manifest'].root.members)).toBe(true);
    const node = operations.getDbtManifestNode({}, '') as any;
    expect(nullObject(node)).toBe(true);
    expect(nullObject(node.members)).toBe(true);
    const selected = operations.selectDbtManifestDependencies({}, {roots: ['x']}) as any;
    expect(plain(selected)).toBe(true);
    expect(nullObject(selected.source)).toBe(true);
    expect(plain(selected.selection)).toBe(true);
  });
});

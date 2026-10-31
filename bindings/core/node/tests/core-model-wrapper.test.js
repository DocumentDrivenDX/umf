import {expect, test} from 'bun:test';
import {createCoreModelOperations as nodeOperations} from '../src/core-model.js';
import {createCoreModelOperations as wasmOperations} from '../../wasm/src/core-model.js';

for (const [host, factory] of [['Node/Bun', nodeOperations], ['WASM', wasmOperations]]) {
  test(`${host} routes record values through the tagged model operation`, () => {
    const source = {umf: '0.10.0'}, identity = {module: 'fixture', element: 'item'}, values = [];
    let call;
    const api = factory((...args) => { call = args; return {source: structuredClone(source), values: []}; });
    const result = api.validateCoreRecordValues(source, identity, values);
    expect(call).toEqual(['model/validateCoreRecordValues', {source, identity, values}]);
    result.source.umf = 'mutated';
    expect(source.umf).toBe('0.10.0');
  });

  test(`${host} exposes the six opt-in semantic type routes`, () => {
    const calls = [];
    const api = factory((...args) => { calls.push(args); return args[0] === 'model/getCoreSemanticTypes' ? {$umf: 'undefined'} : {ok: true}; });
    expect(api.inspectCoreSemanticTypes('s', {module: 'm', element: 'e'})).toEqual({ok: true});
    expect(api.getCoreSemanticTypes('s', {module: 'm', element: 'e'})).toBeUndefined();
    expect(api.declareCoreSemanticTypes('s', {module: 'm', element: 'e'}, null)).toEqual({ok: true});
    expect(api.verifyCoreSemanticTypeDeclaration('r', 'c')).toEqual({ok: true});
    expect(api.getSemanticTypes('d', 'm', 'e')).toEqual({ok: true});
    expect(api.setSemanticTypes('d', 'm', 'e', null)).toEqual({ok: true});
    expect(calls).toEqual([
      ['model/inspectCoreSemanticTypes', {source: 's', identity: {module: 'm', element: 'e'}}],
      ['model/getCoreSemanticTypes', {source: 's', identity: {module: 'm', element: 'e'}}],
      ['model/declareCoreSemanticTypes', {source: 's', identity: {module: 'm', element: 'e'}, types: null}],
      ['model/verifyCoreSemanticTypeDeclaration', {receipt: 'r', current: 'c'}],
      ['extensions/getSemanticTypes', {document: 'd', module: 'm', element: 'e'}],
      ['extensions/setSemanticTypes', {document: 'd', module: 'm', element: 'e', annotation: null}],
    ]);
  });

  test(`${host} decodes only the exact getter undefined sentinel`, () => {
    const api = factory(() => ({$umf: 'undefined', retained: true}));
    expect(api.getCoreSemanticTypes('s', {module: 'm', element: 'e'})).toEqual({$umf: 'undefined', retained: true});
  });

  test(`${host} preserves identity-object admission and cardinality request refusal order`, () => {
    const calls = [];
    const api = factory((...args) => { calls.push(args); return {ok: true}; });
    const identity = {module: 'm', element: 'e', future: true};
    api.inspectCoreCardinalityIdentity('source', identity);
    api.declareCoreCardinalityIdentity('source', identity, {cardinality: 'array'});
    expect(calls[0]).toEqual(['model/inspectCoreCardinality', {source: 'source', identity}]);
    expect(calls[1][0]).toBe('model/declareCoreCardinality');
    expect(Object.keys(calls[1][1])).toEqual(['request', 'source', 'identity']);
    expect(calls[1][1].identity).toBe(identity);
  });

  test(`${host} keeps staged cardinality receipt state behind a private handle`, () => {
    const calls = [];
    const api = factory((...args) => { calls.push(args); return {op: args[0], args: args[1]}; });
    expect(api.admitCoreCardinalityRequest({cardinality: 'one'})).toEqual({op: 'model/admitCoreCardinalityRequest', args: {request: {cardinality: 'one'}}});
    const handle = api.prepareCoreCardinalityVerification({receipt: true});
    expect(handle).toBeTruthy();
    expect(() => api.finishCoreCardinalityVerification({}, {current: true})).toThrow(TypeError);
    expect(api.finishCoreCardinalityVerification(handle, {current: true})).toEqual({
      op: 'model/finishCoreCardinalityVerification',
      args: {prepared: {op: 'model/prepareCoreCardinalityVerification', args: {receipt: {receipt: true}}}, current: {current: true}},
    });
    expect(calls.map(([op]) => op)).toEqual([
      'model/admitCoreCardinalityRequest',
      'model/prepareCoreCardinalityVerification',
      'model/finishCoreCardinalityVerification',
    ]);
    expect(() => api.finishCoreCardinalityVerification(handle, {current: true})).toThrow(TypeError);
  });
}

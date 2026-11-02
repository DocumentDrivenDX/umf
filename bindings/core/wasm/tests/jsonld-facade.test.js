import {describe, expect, test} from 'bun:test';
import {createJsonLdEngine, JSONLD_PROFILE} from '../index.js';
import {encodeWire, fromWire} from '../src/wire.js';

const document = {umf: '0.10.0', id: 'public-jsonld', modules: []};

describe('public JSON-LD WASM facade', () => {
  test('keeps source operations synchronous and returns transformation proposals as promises', async () => {
    const calls = [];
    const module = {
      nativeFamilyDispatcherProfileVersion: () => 'umf.native-family-dispatch/1',
      executeNativeFamilyWire(family, wire) {
        const request = fromWire(JSON.parse(wire));
        calls.push({family, request});
        let value;
        if (request.op === 'jsonld.import') value = document;
        else if (request.op === 'jsonld.export') value = '{"@id":"urn:example"}';
        else if (request.op === 'jsonld.expand') value = {status: 'candidate', candidate: document, complete: false};
        else throw new Error(`Unexpected operation ${request.op}`);
        return JSON.stringify({profile: 'umf.core-wire/1', status: 'ok', wire: encodeWire(value)});
      },
    };
    const jsonld = createJsonLdEngine(module);
    expect(jsonld.profile).toBe(JSONLD_PROFILE);

    const imported = jsonld.importJsonLdDocument('{"@id":"urn:example"}', {
      id: 'public-jsonld', baseIRI: 'https://example.test/', source: 'overridden input is ignored',
    });
    expect(imported).toEqual(document);
    expect(jsonld.exportJsonLdDocument(imported)).toBe('{"@id":"urn:example"}');
    expect(calls[0].request).toMatchObject({op: 'jsonld.import', source: '{"@id":"urn:example"}', id: 'public-jsonld'});

    const proposal = jsonld.proposeJsonLdExpansion(imported, {lossPolicy: 'reject', document: {id: 'overridden'}});
    expect(proposal).toBeInstanceOf(Promise);
    await expect(proposal).resolves.toMatchObject({status: 'candidate', complete: false});
    expect(calls[2].request).toMatchObject({op: 'jsonld.expand', lossPolicy: 'reject'});
    expect(calls[2].request.document).toEqual(imported);
  });
});

// SPDX-License-Identifier: MIT OR Apache-2.0
import {importJsonSchema} from '../../../src/adapters/json-schema/index';
import {nonStringCases, optionsFor} from './json-schema-import-nonstring-cases.mjs';

const result = [];
for (const fixture of nonStringCases()) {
  const events: string[] = [];
  const sentinel = Object.assign(new Error('nonstring host sentinel'), {code: 'HOST_SENTINEL'});
  const input = fixture.makeInput(events, sentinel);
  const {source, options} = optionsFor(fixture, input, events);
  try {
    // These fixtures intentionally violate the public string-input type.
    const document: any = importJsonSchema(source as any, options as any);
    result.push({id: fixture.id, position: fixture.position, events, outcome: {
      kind: 'return', id: document.id,
      namespace: document.modules[0].namespace,
      baseUri: document.modules[0].elements[0].extensions['umf.json-schema'].baseUri,
    }});
  } catch (error: any) {
    result.push({id: fixture.id, position: fixture.position, events, outcome: {
      kind: 'throw', name: error?.name ?? typeof error,
      message: error?.message ?? String(error), code: error?.code ?? null,
      sameObject: error === sentinel,
    }});
  }
}
(globalThis as any).nonStringImportResult = result;

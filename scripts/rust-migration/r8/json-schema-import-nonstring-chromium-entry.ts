// SPDX-License-Identifier: MIT OR Apache-2.0
import {importJsonSchema} from '../../../src/adapters/json-schema/index';
import {boundaryCases, prepareBoundaryCase} from './json-schema-import-nonstring-boundary-cases.mjs';
const results = [];
for (const fixture of boundaryCases()) {
  const events: string[] = [];
  const objectSentinel = Object.assign(new Error('boundary sentinel'), {code: 'BOUNDARY_SENTINEL'});
  const primitiveSentinel = Symbol('boundary thrown sentinel');
  const input = prepareBoundaryCase(fixture, events, {object: objectSentinel, primitive: primitiveSentinel});
  try {
    importJsonSchema(input.source, input.options);
    results.push({id: fixture.id, events, outcome: {kind: 'return'}});
  } catch (error: any) {
    results.push({id: fixture.id, events, outcome: {
      kind: 'throw', name: error?.name ?? typeof error,
      message: error?.message ?? String(error), code: error?.code ?? null,
      sameObject: error === objectSentinel, samePrimitive: error === primitiveSentinel,
    }});
  }
}
document.body.textContent = JSON.stringify({ua: navigator.userAgent, cases: results});

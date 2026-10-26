// SPDX-License-Identifier: MIT OR Apache-2.0
import {writeFile} from 'node:fs/promises';
import {importJsonSchema} from '../../../src/adapters/json-schema/index.ts';
import {boundaryCases, prepareBoundaryCase} from './json-schema-import-nonstring-boundary-cases.mjs';
const cases = [];
for (const fixture of boundaryCases()) {
  const events = [];
  const sentinel = Object.assign(new Error('boundary sentinel'), {code: 'BOUNDARY_SENTINEL'});
  const primitive = Symbol('boundary thrown sentinel');
  const {source, options} = prepareBoundaryCase(fixture, events, {object: sentinel, primitive});
  try {
    const doc = importJsonSchema(source, options);
    cases.push({id: fixture.id, events, outcome: {kind: 'return', id: doc.id}});
  } catch (error) {
    cases.push({id: fixture.id, events, outcome: {
      kind: 'throw', name: error?.name ?? typeof error,
      message: error?.message ?? String(error), code: error?.code ?? null,
      sameObject: error === sentinel, samePrimitive: error === primitive,
    }});
  }
}
const result = {profile: 'direct-typescript', cases};
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n');
else process.stdout.write(JSON.stringify(result));

// SPDX-License-Identifier: MIT OR Apache-2.0
import {writeFile} from 'node:fs/promises';
import {nonStringCases, optionsFor} from './json-schema-import-nonstring-cases.mjs';

const {importJsonSchema} = await import('../../../src/adapters/json-schema/index.ts');
const cases = [];
for (const fixture of nonStringCases()) {
  const events = [];
  const sentinel = Object.assign(new Error('nonstring host sentinel'), {code: 'HOST_SENTINEL'});
  const input = fixture.makeInput(events, sentinel);
  const {source, options} = optionsFor(fixture, input, events);
  try {
    const document = importJsonSchema(source, options);
    cases.push({id: fixture.id, position: fixture.position, events, outcome: {
      kind: 'return', id: document.id,
      namespace: document.modules[0].namespace,
      baseUri: document.modules[0].elements[0].extensions['umf.json-schema'].baseUri,
    }});
  } catch (error) {
    cases.push({id: fixture.id, position: fixture.position, events, outcome: {
      kind: 'throw', name: error?.name ?? typeof error,
      message: error?.message ?? String(error), code: error?.code ?? null,
      sameObject: error === sentinel,
    }});
  }
}
const result = {profile: 'direct-typescript', cases};
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n');
else process.stdout.write(JSON.stringify(result));

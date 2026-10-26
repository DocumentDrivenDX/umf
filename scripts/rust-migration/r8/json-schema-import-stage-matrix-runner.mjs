// SPDX-License-Identifier: MIT OR Apache-2.0
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {matrixCases} from './json-schema-import-stage-matrix-cases.mjs';

const profile = process.env.UMF_IMPORT_MATRIX_PROFILE;
const eventsByCase = [];
let invoke;
let stages = [];
if (profile === 'typescript') {
  const {importJsonSchema} = await import('../../../src/adapters/json-schema/index.ts');
  invoke = (source, options) => importJsonSchema(source, options);
} else if (profile === 'node-native') {
  if (!process.env.UMF_NODE_ADDON_PATH) throw new Error('UMF_NODE_ADDON_PATH is required');
  const addon = createRequire(import.meta.url)(process.env.UMF_NODE_ADDON_PATH);
  const Original = addon.JsonSchemaImportSessionHandle;
  addon.JsonSchemaImportSessionHandle = class extends Original {
    executeStage(wire) {
      const req = JSON.parse(wire);
      const stage = req.members.find(x => String.fromCharCode(...x.key) === 'stage');
      stages.push(String.fromCharCode(...stage.value.units));
      return super.executeStage(wire);
    }
  };
  const {createJsonSchemaStagedImportSession} = await import('../../../bindings/core/node/src/json-schema-import-session.js');
  const api = createJsonSchemaStagedImportSession(addon);
  invoke = (source, options) => api.importJsonSchema(source, options);
} else {
  throw new Error(`Unsupported matrix profile: ${profile}`);
}

for (const fixture of matrixCases()) {
  const events = [];
  stages = [];
  const sentinel = Object.assign(new Error('matrix host sentinel'), {code: 'HOST_SENTINEL'});
  const options = fixture.makeOptions(events, sentinel);
  try {
    const document = invoke(fixture.source, options);
    eventsByCase.push({id: fixture.id, events, stages: [...stages], outcome: {kind: 'return', document}});
  } catch (error) {
    eventsByCase.push({id: fixture.id, events, stages: [...stages], outcome: {
      kind: 'throw', name: error?.name ?? typeof error, message: error?.message ?? String(error),
      code: error?.code ?? null, path: error?.path ?? null, sameObject: error === sentinel,
    }});
  }
}
const result = {profile, cases: eventsByCase};
if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(result, null, 2) + '\n');
else process.stdout.write(JSON.stringify(result));

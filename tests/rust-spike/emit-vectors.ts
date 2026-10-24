// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir, writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {currentTypeScriptOutcomes, modelText, recordInput, requests, sourceCorpus, utf16Units} from './vectors';

const output = process.argv[2];
if (!output) throw new Error('Usage: bun tests/rust-spike/emit-vectors.ts OUTPUT.json');
const unsupported = JSON.parse(modelText);
unsupported.umf = '0.9.0';
const unsupportedText = JSON.stringify(unsupported);
const payload = {
  protocol: 'umf-rust-spike-r1/0.1',
  requests: requests(),
  callbackRequest: {op: 'source-roundtrip', sourceUnits: [0xd800, 0x0041, 0xdc00], validatorRequired: true},
  validationCallbackRequest: {op: 'validate-record', model: JSON.parse(modelText), sourceUnits: utf16Units(modelText), record: recordInput,
    validatorRequired: true},
  throwingCallbackRequest: {op: 'source-roundtrip', sourceUnits: utf16Units('callback-error-source'), validatorRequired: true},
  reentrantCallbackRequest: {op: 'source-roundtrip', sourceUnits: utf16Units('outer-callback-source'), validatorRequired: true},
  sourceCorpus,
  modelText,
  unsupportedModelText: unsupportedText,
  expected: currentTypeScriptOutcomes(),
};
await mkdir(dirname(output), {recursive: true});
await writeFile(output, JSON.stringify(payload, null, 2) + '\n');
if (process.argv[3]) {
  const requests = [...payload.requests,
    {op: 'source-roundtrip', sourceUnits: [1, 2, 3, 4], options: {capacity: 3}},
    {op: 'source-roundtrip', sourceUnits: [65], options: {deadlineUnixMs: 0}},
    {op: 'validate-record', model: JSON.parse(payload.modelText), sourceUnits: utf16Units(payload.modelText), record: {identity: {module: 'm', element: 'Item'}, values: []}, options: {cancelAtStep: 2}},
    {op: 'source-roundtrip', sourceUnits: [65], validatorRequired: true},
  ];
  await writeFile(process.argv[3], requests.map(request => JSON.stringify(request)).join('\n') + '\n');
}

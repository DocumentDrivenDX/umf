// SPDX-License-Identifier: MIT OR Apache-2.0
// Captures the TypeScript document import/export boundary used by the R8 CLI.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { importProtobufDescriptorSet, exportProtobufDescriptorSet } from '../../../../../../src/adapters/protobuf/index';

const input = new Uint8Array(await readFile('fixtures/protobuf/authored.pb'));
const document = importProtobufDescriptorSet(input, { id: 'schema' });
const output = exportProtobufDescriptorSet(document);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
console.log(JSON.stringify({
  artifactId: 'R8-PROTOBUF-DOCUMENT-EXPORT-CLI-PREDECESSOR',
  runtime: { bun: Bun.version, node: process.versions.node },
  inputBytes: input.length,
  inputSha256: hash(input),
  documentId: document.id,
  outputBytes: output.length,
  outputSha256: hash(output),
}));

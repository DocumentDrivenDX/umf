// SPDX-License-Identifier: MIT OR Apache-2.0
// Supplemental predecessor probe; intentionally does not modify predecessor.json.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { readDescriptorSet, writeDescriptorSet } from '../../../../../../src/adapters/protobuf/descriptor';

const input = Uint8Array.from(Buffer.from('0a05420348e300', 'hex'));
const node = readDescriptorSet(input);
const options = (node.fields.file[0] as any).fields.options;
const result = {
  label: 'closed-enum-overlong-99',
  inputHex: Buffer.from(input).toString('hex'),
  inputSha256: createHash('sha256').update(input).digest('hex'),
  predecessorUnknown: options.unknown,
  predecessorOutputHex: Buffer.from(writeDescriptorSet(node)).toString('hex'),
  sources: {
    descriptor: createHash('sha256').update(await readFile('src/adapters/protobuf/descriptor.ts')).digest('hex'),
    contract: createHash('sha256').update(await readFile('docs/helix/02-design/contracts/CONTRACT-003-protobuf.md')).digest('hex'),
  },
};
console.log(JSON.stringify(result, null, 2));

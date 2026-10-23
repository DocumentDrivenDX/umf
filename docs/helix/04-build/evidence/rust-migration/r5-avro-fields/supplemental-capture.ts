// SPDX-License-Identifier: MIT OR Apache-2.0
// Additive targeted controls; never rewrites the immutable 100-case packet.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {deriveAvroFields} from '../../../../../../src/adapters/avro/metadata';
import {parseNativeJson} from '../../../../../../src/adapters/json-schema/tree';

const cases = [
  {label: 'record-name-missing', source: '{"type":"record","fields":[{"name":"x","type":"int"}]}'},
  {label: 'record-name-empty', source: '{"type":"record","name":"","fields":[{"name":"x","type":"int"}]}'},
  {label: 'field-name-empty', source: '{"type":"record","name":"R","fields":[{"name":"","type":"int"}]}'},
  {label: 'fixed-size-wasm32-overflow', source: '{"type":"record","name":"R","fields":[{"name":"x","type":{"type":"fixed","name":"F","size":4294967297,"logicalType":"decimal","precision":1}}]}'},
  {label: 'precision-wasm32-overflow', source: '{"type":"record","name":"R","fields":[{"name":"x","type":{"type":"fixed","name":"F","size":1,"logicalType":"decimal","precision":4294967297}}]}'},
];
const observations = cases.map(({label, source}) => ({
  label,
  source,
  fields: deriveAvroFields({version: '1.12.0', root: parseNativeJson(source)}),
}));
if (observations.slice(0, 3).some(({fields}) => fields.length !== 0)) throw new Error('Empty Avro names must derive no fields');
if (observations.slice(3).some(({fields}) => fields.length !== 1 || fields[0].element.scalarType !== undefined)) throw new Error('Out-of-range decimal qualifiers must not classify');
const sourceSha256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
await writeFile(new URL('./supplemental.json', import.meta.url), `${JSON.stringify({kind: 'umf-r5-avro-fields-supplement/1', sourceSha256, observations}, null, 2)}\n`);
console.log(JSON.stringify({cases: observations.length, sourceSha256}));

// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {
  UmfError,
  appendParquetKeyValueMetadata,
  captureParquet,
  exportParquetCapture,
  inspectParquetMetadata,
} from '../../src/index-node-v4';

const parquetFixture=()=>new Uint8Array(readFileSync(resolve(import.meta.dir,'../../fixtures/parquet/logical/string.parquet')));

test('Node default Parquet capture imports, edits metadata and exports while preserving the data prefix',()=>{
  const bytes=parquetFixture();
  const document=captureParquet(bytes,{id:'parquet-native-root'});
  const before=inspectParquetMetadata(document);
  expect(before.status).toBe('mapped');
  const proposal=appendParquetKeyValueMetadata(document,[{key:'umf.test',value:'retained'}]);
  expect(proposal.status).toBe('transformed');
  expect(proposal.output).toBeDefined();
  expect(proposal.unchangedPrefixBytes).toBeGreaterThan(0);
  const exported=exportParquetCapture(proposal.output!);
  expect(exported.subarray(0,proposal.unchangedPrefixBytes)).toEqual(bytes.subarray(0,proposal.unchangedPrefixBytes));
  expect(exported).not.toEqual(bytes);
},60_000);

test('Node default Parquet capture maps oversized source refusal to the public error class',()=>{
  let refusal:unknown;
  try { captureParquet(new Uint8Array(1_000_001),{id:'parquet-too-large'}); } catch(error) { refusal=error; }
  expect(refusal).toBeInstanceOf(UmfError);
  expect(refusal).toMatchObject({name:'UmfError',code:'PARQUET_LIMIT'});
},30_000);

// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import test from 'node:test';
import {frozenPath,replayApis} from './replay-installed-semantic-types.mjs';
import {readFile} from 'node:fs/promises';

test('Node V4 source export replays frozen R5 semantic-type behavior against ./reference',{skip:!process.versions.bun&&'TypeScript source mode requires Bun'},async()=>{
  const [api,referenceApi,packet]=await Promise.all([
    import('../../../src/index-node-v4.ts'),
    import('../../../src/index.ts'),
    readFile(frozenPath,'utf8').then(JSON.parse),
  ]);
  const receipt=await replayApis(api,referenceApi,packet);
  assert.equal(receipt.status,'pass');
  assert.equal(receipt.defaultRoute.aggregate,'Rust dispatcher result matches frozen predecessor');
});

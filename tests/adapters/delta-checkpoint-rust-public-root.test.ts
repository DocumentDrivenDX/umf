// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {captureDeltaLog,reconcileDeltaCheckpoint} from '../../src/index-node-v4';
import type {DeltaCommit} from '../../src/index-node-v4';

test('Node V4 reconciles an explicit Delta checkpoint through Rust',()=>{
 const checkpoint:DeltaCommit={version:'10',source:captureDeltaLog('{"protocol":{"minReaderVersion":1,"minWriterVersion":2}}\n{"metaData":{"id":"table","format":{"provider":"parquet"},"schemaString":"{\\"type\\":\\"struct\\",\\"fields\\":[]}","partitionColumns":[],"configuration":{}}}\n',{id:'checkpoint'})};
 const result=reconcileDeltaCheckpoint(checkpoint,[],'v1');
 expect(result.status).toBe('reconciled');expect(result.checkpoint).toEqual(checkpoint);expect(result.state?.version).toBe('10');
 const refused=reconcileDeltaCheckpoint(checkpoint,[],'v3' as 'v1'|'v2');
 expect(refused.status).toBe('blocked');expect(refused.checkpoint).toEqual(checkpoint);expect(refused.state).toBeUndefined();
});

// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyTableSpecKeys,importTableSpec,recoverTableSpecKeySource,verifyTableSpecKeyClassification} from '../../src/index-node-v4';

const sourceText='{"version":"1.0","table_name":"Keys","columns":[{"name":"id","data_type":"INTEGER"}],"primary_key":["id"],"future":{"exact":9007199254740993}}\n';
const report={mode:'report',profile:'declared-metadata'} as const;

test('Node V4 routes TableSpec Key observation, verification, recovery and strict refusal through Rust',()=>{
 const source=importTableSpec(sourceText,{id:'keys-public-root',format:'json'});
 const receipt=classifyTableSpecKeys(source,report);
 expect(receipt.status).toBe('classified');
 expect(receipt.observations[0]!.columns).toEqual(['id']);
 expect(receipt.observations[0]!.resolvedFields).toEqual([{module:'table',element:'column:0'}]);
 expect(verifyTableSpecKeyClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverTableSpecKeySource(receipt,receipt.target!)).toBe(sourceText);
 const refused=classifyTableSpecKeys(source,{...report,mode:'strict'});
 expect(refused.status).toBe('blocked');
 expect(refused.target).toBeUndefined();
});

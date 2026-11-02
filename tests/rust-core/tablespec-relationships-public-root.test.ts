// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyTableSpecRelationships,importTableSpec,recoverTableSpecRelationshipSource,verifyTableSpecRelationshipClassification} from '../../src/index-node-v4';

const sourceText='{"version":"1.0","table_name":"Relations","columns":[{"name":"id","data_type":"INTEGER"},{"name":"customer_id","data_type":"INTEGER"}],"relationships":{"foreign_keys":[{"column":"customer_id","references_table":"customers","references_column":"id","future":{"exact":9007199254740993}}]}}\n';
const report={mode:'report',profile:'declared-metadata'} as const;

test('Node V4 routes TableSpec relationship observation, verification, recovery and strict refusal through Rust',()=>{
 const source=importTableSpec(sourceText,{id:'relationships-public-root',format:'json'});
 const receipt=classifyTableSpecRelationships(source,report);
 expect(receipt.status).toBe('classified');
 expect(receipt.observations[0]!.carrier).toBe('foreign_keys');
 expect(receipt.observations[0]!.resolvedSource).toEqual({module:'table',element:'column:1'});
 expect(verifyTableSpecRelationshipClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverTableSpecRelationshipSource(receipt,receipt.target!)).toBe(sourceText);
 const refused=classifyTableSpecRelationships(source,{...report,mode:'strict'});
 expect(refused.status).toBe('blocked');
 expect(refused.target).toBeUndefined();
});

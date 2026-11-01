// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {classifySqlServerKeys,verifySqlServerKeyClassification,recoverSqlServerKeySource,importSqlServerCatalog} from '../../src/index-node-v4';
import proof from '../../fixtures/validation/key-sqlserver-discovery-native.json';
const nativeSource=proof.sourceText;
const source=()=>importSqlServerCatalog(nativeSource,{id:'sqlserver-key-public'});
const request={nativeSource,mode:'report',profile:'captured-stored-values'} as const;
test('public SQL Server Keys classifier preserves observations, verifies its current target, and recovers exact native text',()=>{
 const receipt=classifySqlServerKeys(source(),request);
 expect(receipt.status).toBe('classified');
 expect(receipt.observations).toHaveLength(25);
 expect(verifySqlServerKeyClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverSqlServerKeySource(receipt,receipt.target!)).toBe(nativeSource);
});
test('public SQL Server Keys strict mode refuses unresolved native equality and does not produce a target',()=>{
 const receipt=classifySqlServerKeys(source(),{...request,mode:'strict'});
 expect(receipt.status).toBe('blocked');
 expect(receipt.target).toBeUndefined();
 expect(receipt.diagnostics.some(d=>d.code==='SQLSERVER_KEY_RESIDUAL')).toBe(true);
});

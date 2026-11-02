// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyPostgresqlNullability,verifyPostgresqlNullabilityClassification,recoverPostgresqlNullabilitySource} from '../../src/index-node-v4';
import {postgresqlAvailabilitySource} from '../../scripts/core-ideals/nullability-postgresql-cases';
const fixture=await Bun.file('fixtures/validation/nullability-postgresql-native.json').json();
test('PostgreSQL nullability public Rust route classifies, verifies and recovers a stored declaration',()=>{
 const nativeSource=fixture.nativeSource as string;const {source,column}=postgresqlAvailabilitySource(nativeSource,'required');
 const receipt=classifyPostgresqlNullability(source,{column,nativeSource,mode:'strict',scope:'stored-relation',carrier:'sql-null'});
 expect(receipt.status).toBe('classified');expect(receipt.mapping.nullability).toBe('required');
 expect(verifyPostgresqlNullabilityClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverPostgresqlNullabilitySource(receipt,receipt.target!)).toBe(nativeSource);
});
test('PostgreSQL nullability strict mode refuses to equate write-input omission with SQL NULL',()=>{
 const nativeSource=fixture.nativeSource as string;const {source,column}=postgresqlAvailabilitySource(nativeSource,'required');
 const receipt=classifyPostgresqlNullability(source,{column,nativeSource,mode:'strict',scope:'write-input',carrier:'sql-null'});
 expect(receipt.status).toBe('blocked');expect(receipt.target).toBeUndefined();expect(receipt.diagnostics.some(d=>d.code==='POSTGRESQL_NULLABILITY_UNRESOLVED')).toBe(true);
});

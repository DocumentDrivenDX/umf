// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {projectDddToPostgresql,recoverDddPostgresqlIdeal,recoverDddPostgresqlNative,verifyDddPostgresqlProjection} from '../../src/index-node-v4';
import {backend} from '../../native/postgresql/runtime';
import {dddPostgresqlCases} from '../../scripts/projections/ddd-postgresql-cases';

test('Rust DDD PostgreSQL public route composes and verifies a relationship projection',async()=>{
 const c=dddPostgresqlCases()[0]!;
 const receipt=await projectDddToPostgresql(c.logical,c.binding,c.policy,backend);
 expect(receipt.status).toBe('projected');
 if(receipt.nativeSource===undefined)throw new Error('Projected PostgreSQL receipt must include native source');expect(receipt.source).toEqual(c.logical);expect(receipt.binding).toEqual(c.binding);
 expect(receipt.nativeSource).toContain('FOREIGN KEY');expect(receipt.nativeSource).toContain('CREATE TABLE');expect(receipt.targetArchive).toBeDefined();
 expect(await verifyDddPostgresqlProjection(receipt,receipt.targetArchive!,backend)).toEqual(receipt);
 expect(await recoverDddPostgresqlIdeal(receipt,receipt.targetArchive!,backend)).toEqual({logical:c.logical,binding:c.binding,policy:c.policy});
 expect(await recoverDddPostgresqlNative(receipt,receipt.targetArchive!,backend)).toBe(receipt.nativeSource);
 const strict=await projectDddToPostgresql(c.logical,c.binding,{...c.policy,mode:'strict'},backend);
 expect(strict.status).toBe('blocked');expect(strict.nativeSource).toBeUndefined();expect(strict.source).toEqual(c.logical);
},120000);

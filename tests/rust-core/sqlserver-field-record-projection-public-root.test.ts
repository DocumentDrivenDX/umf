// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {sqlServerFieldCases} from '../../scripts/core-ideals/field-sqlserver-projection-cases';
import {sqlServerRecordCases} from '../../scripts/core-ideals/record-sqlserver-projection-cases';
import {projectFieldToSqlServer,recoverFieldFromSqlServer,projectRecordToSqlServer,recoverRecordFromSqlServer} from '../../src/index-node-v4';
import {copyJson} from '../../src/model/json';

test('V4 Field SQL Server projection retains source, recovers from its receipt and refuses strict loss',()=>{
 const fixture=sqlServerFieldCases()[0]!;
 const receipt=projectFieldToSqlServer(fixture.author,fixture.request);
 expect(receipt.status).toBe('projected');
 expect(receipt.nativeSql).toContain('CREATE TABLE [sales].[field_0]');
 expect(recoverFieldFromSqlServer(receipt,receipt.nativeSql!)).toEqual(fixture.author.target);
 const refusal=projectFieldToSqlServer(fixture.author,{...fixture.request,columnName:'renamed',mode:'strict'});
 expect(refusal.status).toBe('blocked');
 expect(refusal.target).toBeUndefined();
 expect(refusal.residuals.length).toBeGreaterThan(0);
});

test('V4 Record SQL Server projection follows authored member order and recovery checks native SQL',()=>{
 const fixture=sqlServerRecordCases()[0]!;
 const receipt=projectRecordToSqlServer(fixture.author,fixture.request);
 expect(receipt.status).toBe('projected');
 expect(receipt.nativeSql).toContain('CREATE TABLE [sales].[Orders] ([id] int NULL, [label] nvarchar(max) NULL, [active] bit NULL)');
 expect(recoverRecordFromSqlServer(receipt,receipt.nativeSql!)).toEqual(fixture.author.target);
 expect(()=>recoverRecordFromSqlServer(receipt,receipt.nativeSql!+' ')).toThrow();
 const request=copyJson(fixture.request) as unknown as typeof fixture.request;
 request.fields=[];
 const refusal=projectRecordToSqlServer(fixture.author,request);
 expect(refusal.status).toBe('blocked');
 expect(refusal.nativeSql).toBeUndefined();
});

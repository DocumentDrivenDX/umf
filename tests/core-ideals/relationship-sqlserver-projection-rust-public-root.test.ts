// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {
 projectRelationshipToSqlServer,
 verifyRelationshipSqlServerProjection,
 recoverRelationshipSqlServerIdeal,
 recoverRelationshipSqlServerBinding,
 recoverRelationshipSqlServerNative,
} from '../../src/index-node-v4';
import {relationshipSqlServerCase} from '../../scripts/core-ideals/relationship-sqlserver-cases';

test('Node V4 authored relationship to SQL Server uses the native Rust route',()=>{
 const c=relationshipSqlServerCase('many-to-one'),before=JSON.stringify(c.source);
 const projected=projectRelationshipToSqlServer(c.source,c.author,c.binding,c.request);
 expect(projected.status).toBe('projected');expect(projected.target?.sql).toContain('FOREIGN KEY ([ref_0])');
 expect(projected.target?.sql).toContain('REFERENCES [dbo].[Target] ([target_0])');expect(projected.mappings).toHaveLength(1);
 expect(JSON.stringify(c.source)).toBe(before);
 expect(verifyRelationshipSqlServerProjection(projected,projected.target!)).toEqual(projected);
 expect(recoverRelationshipSqlServerIdeal(projected,projected.target!)).toEqual(c.source);
 expect(recoverRelationshipSqlServerBinding(projected,projected.target!)).toEqual(c.binding);
 const nativeSource=recoverRelationshipSqlServerNative(projected,projected.target!);
 expect(projected.target?.sql).toBeDefined();
 expect(nativeSource).toBe(projected.target!.sql!);
 const strict=projectRelationshipToSqlServer(c.source,c.author,c.binding,{...c.request,mode:'strict'});
 expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();expect(strict.mappings).toHaveLength(0);
},60000);

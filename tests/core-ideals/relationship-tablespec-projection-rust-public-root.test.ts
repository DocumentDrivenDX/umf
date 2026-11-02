// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {
 projectRelationshipToTableSpec,
 verifyRelationshipTableSpecProjection,
 recoverRelationshipTableSpecIdeal,
 recoverRelationshipTableSpecNativeSources,
} from '../../src/index-node-v4';
import {relationshipTableSpecCase} from '../../scripts/core-ideals/relationship-tablespec-projection-cases';

test('Node V4 authored relationship to TableSpec uses the native Rust route',()=>{
 const c=relationshipTableSpecCase('many-to-one'),before=JSON.stringify(c.source);
 const projected=projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,c.request);
 expect(projected.status).toBe('projected');expect(projected.target).toBeDefined();expect(projected.mappings).toHaveLength(1);
 expect(JSON.stringify(c.source)).toBe(before);
 expect(verifyRelationshipTableSpecProjection(projected,projected.target!)).toEqual(projected);
 expect(recoverRelationshipTableSpecIdeal(projected,projected.target!)).toEqual(c.source);
 const native=recoverRelationshipTableSpecNativeSources(projected,projected.target!);
 expect(typeof native.source).toBe('string');expect(typeof native.target).toBe('string');expect(native.source as string).toContain('Orders');expect(native.target as string).toContain('Customers');
 const strict=projectRelationshipToTableSpec(c.source,c.author,c.nativeSource,c.nativeTarget,{...c.request,mode:'strict'});
 expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();expect(strict.mappings).toHaveLength(0);
},60000);

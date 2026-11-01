// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {projectRelationshipToAvro,verifyRelationshipAvroProjection,recoverRelationshipAvroIdeal,recoverRelationshipAvroNative} from '../../src/index-node-v4';
import {relationshipAvroCase} from '../../scripts/core-ideals/relationship-avro-projection-cases';

test('Node V4 authored relationship to Avro uses the native Rust route',async()=>{
 const c=relationshipAvroCase('many-to-one'),before=JSON.stringify(c.source);
 const projected=projectRelationshipToAvro(c.source,c.author,c.request);
 expect(projected.status).toBe('projected');
 if(!projected.nativeArchive)throw new Error('Projected Avro relationship must retain its native archive');
 expect(projected.nativeArchive.schema).toContain('TargetKey');
 expect(projected.mappings).toHaveLength(1);expect(JSON.stringify(c.source)).toBe(before);
 expect(verifyRelationshipAvroProjection(projected,projected.target!)).toEqual(projected);
 expect(recoverRelationshipAvroIdeal(projected,projected.target!)).toEqual(c.source);
 expect(recoverRelationshipAvroNative(projected,projected.target!)).toEqual(projected.nativeArchive);
 const strict=projectRelationshipToAvro(c.source,c.author,{...c.request,mode:'strict'});
 expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();expect(strict.nativeArchive).toBeUndefined();
 const reserved=projectRelationshipToAvro(c.source,c.author,{...c.request,keyRecordName:'int'});
 expect(reserved.status).toBe('blocked');expect(reserved.target).toBeUndefined();expect(reserved.residuals.some(x=>x.path==='/request'&&x.outcome==='not-expressible')).toBe(true);
},60000);

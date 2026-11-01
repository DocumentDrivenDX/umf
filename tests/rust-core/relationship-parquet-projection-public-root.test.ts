// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {projectRelationshipToParquet,verifyRelationshipParquetProjection,recoverRelationshipParquetIdeal,recoverRelationshipParquetNative} from '../../src/index-node-v4';
import {relationshipParquetCases} from '../../scripts/core-ideals/relationship-parquet-cases';

test('authored Relationship to Parquet public Node route preserves a receipt and strict mode refuses',()=>{
 const c=relationshipParquetCases().find(x=>x.name==='many-to-one-report');if(!c)throw new Error('Expected the ordinary many-to-one Parquet fixture');
 const result=projectRelationshipToParquet(c.source,c.author,c.request);expect(result.status).toBe('projected');expect(result.nativeArchive).toBeDefined();if(!result.nativeArchive)throw new Error('Projected Parquet archive is required');expect(result.nativeArchive.hex).toMatch(/^(?:[0-9a-f]{2})+$/);expect(result.target).toBeDefined();
 expect(verifyRelationshipParquetProjection(result,result.target!)).toEqual(result);expect(recoverRelationshipParquetIdeal(result,result.target!)).toEqual(c.source);const native=recoverRelationshipParquetNative(result,result.target!);expect(native).toBeDefined();if(!native)throw new Error('Recovered Parquet archive is required');expect(native).toEqual(result.nativeArchive);
 const strict=projectRelationshipToParquet(c.source,c.author,{...c.request,mode:'strict'});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();expect(strict.nativeArchive).toBeUndefined();
},60_000);

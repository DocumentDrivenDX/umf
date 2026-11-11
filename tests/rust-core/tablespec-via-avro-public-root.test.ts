// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {projectToTableSpecViaAvro,type TableSpecViaAvroPolicy} from '../../src/index-node-v4';
import type {PostgresqlAvroPolicy} from '../../src/projections/postgresql-avro-types';

test('PostgreSQL to Avro to TableSpec uses the native composite and preserves both stage reports',()=>{
 const fixture=JSON.parse(readFileSync('fixtures/validation/tablespec-chains.json','utf8'));
 const sample=fixture.cases[0];
 const source=sample.source;
 const policy=sample.policy as TableSpecViaAvroPolicy & {sourceKind:'postgresql';toAvro:PostgresqlAvroPolicy};
 const projected=projectToTableSpecViaAvro(source,policy);
 expect(projected.status).toBe('projected');expect(projected.source).toEqual(source);expect(projected.target).toBeDefined();
 const secondStage=projected.stages.avroToTableSpec;if(!secondStage)throw new Error('Projected chain must retain its second-stage report');
 const avroDocument=projected.stages.sourceToAvro.target;if(!avroDocument)throw new Error('Projected chain must retain its intermediate Avro document');
 expect(projected.stages.sourceToAvro.source).toEqual(source);expect(secondStage.source).toEqual(avroDocument);
 expect(projected.issues.filter(item=>item.stage==='sourceToAvro').map(item=>item.issue)).toEqual(projected.stages.sourceToAvro.issues);
 expect(projected.issues.filter(item=>item.stage==='avroToTableSpec').map(item=>item.issue)).toEqual(secondStage.issues);
 const strictFirst=projectToTableSpecViaAvro(source,{...policy,toAvro:{...policy.toAvro,lossPolicy:'strict'}});
 expect(strictFirst.status).toBe('blocked');expect(strictFirst.stages.avroToTableSpec).toBeUndefined();expect(strictFirst.target).toBeUndefined();
 expect(()=>projectToTableSpecViaAvro(source,{...policy,toTableSpec:{...policy.toTableSpec,tableName:'_invalid'}})).toThrow('second-stage');
},90_000);

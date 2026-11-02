// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {projectDddTablesToPostgresql,type Document} from '../../src/index-node-v4';

const fixture=await Bun.file('fixtures/projections/ddd-postgresql-tables/case.json').json();
const logical=fixture.logical as Document,binding=fixture.binding as Document,policy=fixture.policy;

test('Rust default root projects independent DDD tables and retains loss',async()=>{
 const report=await projectDddTablesToPostgresql(logical,binding,backend,policy,'report');
 expect(report.status).toBe('reported');
 expect(report.candidate?.match(/CREATE TABLE/g)).toHaveLength(5);
 expect(report.candidate).toContain('PARTITION BY LIST ("tenant")');
 expect(report.targetArchive).toBeDefined();
 expect(report.logical).toEqual(logical);expect(report.binding).toEqual(binding);
 const strict=await projectDddTablesToPostgresql(logical,binding,backend,policy,'strict');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
},60000);

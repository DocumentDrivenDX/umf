// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {importPostgresqlCatalogCapture,projectPostgresqlRowToJsonSchema,type PostgresqlRowPolicy} from '../../src/index-node-v4';
const source=importPostgresqlCatalogCapture(await Bun.file('fixtures/postgresql/catalog-capture.json').text(),{id:'rows'});
const policy:PostgresqlRowPolicy={id:'orders',schemaId:'urn:test:orders',relation:{schema:'sales',name:'orders'},columns:{id:'sql-text',total:'sql-text',details:'json-value'},lossPolicy:'allow-reported-loss'};
test('Rust PostgreSQL row projection produces a bounded row schema and reports strict-loss refusal',()=>{
 const result=projectPostgresqlRowToJsonSchema(source,policy);
 expect(result.status).toBe('projected');expect(result.complete).toBe(false);expect(result.source).toEqual(source);expect(result.nativeSchema).toBe(JSON.stringify(JSON.parse(result.nativeSchema!),null,2)+'\n');expect(result.sql).toContain('"sales"."orders"');expect(result.sql).toContain('r."total"::text');
 const blocked=projectPostgresqlRowToJsonSchema(source,{...policy,lossPolicy:'strict'});expect(blocked.status).toBe('blocked');expect(blocked.target).toBeUndefined();expect(blocked.source).toEqual(source);
});

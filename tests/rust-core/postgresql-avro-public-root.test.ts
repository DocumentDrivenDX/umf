// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {importPostgresqlCatalogCapture,projectPostgresqlToAvro,type PostgresqlAvroPolicy,UmfError} from '../../src/index-node-v4';

test('PostgreSQL capture to Avro public Node route retains source, reports loss, and refuses unsupported mappings',()=>{
 const source=importPostgresqlCatalogCapture(readFileSync('fixtures/postgresql/catalog-capture.json','utf8'),{id:'pg-capture'});
 const policy:PostgresqlAvroPolicy={id:'events-avro',recordName:'Events',namespace:'example.events',table:{schema:'public',name:'events'},lossPolicy:'allow-reported-loss',fields:{at:{name:'at',representation:'avro-temporal'},payload:{name:'payload',representation:'sql-text'}}};
 const result=projectPostgresqlToAvro(source,policy);
 expect(result.status).toBe('projected');expect(result.source).toEqual(source);expect(result.target).toBeDefined();expect(result.issues.some(issue=>issue.code==='SCHEMA_ONLY')).toBe(true);expect(JSON.parse(result.nativeSchema!).fields.find((field:any)=>field.name==='payload').type).toEqual(['null','string']);
 const strict=projectPostgresqlToAvro(source,{...policy,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
 const unsupported=projectPostgresqlToAvro(source,{...policy,fields:{payload:{name:'payload',representation:'value'}}});expect(unsupported.status).toBe('blocked');expect(unsupported.target).toBeUndefined();
 expect(()=>projectPostgresqlToAvro(source,{...policy,namespace:'invalid..namespace'})).toThrow(UmfError);
},60_000);

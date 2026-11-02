// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {importSqlServerCatalog,projectSqlServerToAvro,type SqlServerAvroPolicy} from '../../src/index-node-v4';

test('SQL Server catalog to Avro public Node route retains source, reports loss, and refuses unsupported mappings',()=>{
 const source=importSqlServerCatalog(readFileSync('fixtures/sqlserver/catalog.json','utf8'),{id:'sqlserver-catalog'});
 const policy:SqlServerAvroPolicy={id:'types-avro',recordName:'Types',namespace:'example.sqlserver',table:{schema:'sales',name:'Types'},lossPolicy:'allow-reported-loss',fields:{id:{name:'id',representation:'value'},flag:{name:'flag',representation:'value'}}};
 const result=projectSqlServerToAvro(source,policy);
 expect(result.status).toBe('projected');expect(result.source).toEqual(source);expect(result.target).toBeDefined();expect(result.issues.some(issue=>issue.code==='SCHEMA_ONLY')).toBe(true);expect(JSON.parse(result.nativeSchema!).fields.map((field:any)=>field.name)).toEqual(['id','flag']);
 const strict=projectSqlServerToAvro(source,{...policy,lossPolicy:'strict'});expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();
 const unsupported=projectSqlServerToAvro(source,{...policy,fields:{absent:{name:'absent',representation:'value'}}});expect(unsupported.status).toBe('blocked');expect(unsupported.target).toBeUndefined();
},60_000);

// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {getPostgresqlSource,projectDddTablesAndIndexesToPostgresql,type Document} from '../../src/index-node-v4';
import type {BindingPayload} from '../../src/extensions/binding';

function bindingPayload(document:Document):BindingPayload{
 const value=document.extensions?.['umf.binding'];
 if(value===undefined||value===null||typeof value!=='object'||Array.isArray(value))throw new Error('Expected object-valued umf.binding payload');
 return value as unknown as BindingPayload;
}

const fixture=await Bun.file('fixtures/projections/ddd-postgresql-tables/case.json').json();
const logical=fixture.logical as Document,binding=fixture.binding as Document,policy=fixture.policy;

test('Rust default DDD tables and indexes retains each declined index and its parsed source',async()=>{
 const report=await projectDddTablesAndIndexesToPostgresql(logical,binding,backend,policy,'report');
 expect(report.status).toBe('reported');
 expect(report.candidate?.match(/CREATE (?:UNIQUE )?INDEX/g)).toHaveLength(4);
 expect(report.candidate).toContain('ON "sales"."orders" USING btree');
 expect(report.candidate).toContain('ON "sales"."orders" USING hash');
 expect(report.residuals.filter(row=>row.path.startsWith('/extensions/umf.binding/indexes/')).map(row=>row.path)).toEqual([2,3,6,7].map(i=>`/extensions/umf.binding/indexes/${i}`));
 expect(getPostgresqlSource(report.targetArchive!)).toBe(report.candidate!);
 const strict=await projectDddTablesAndIndexesToPostgresql(logical,binding,backend,policy,'strict');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
},240000);

test('Rust default DDD tables and indexes refuses an unbound index before SQL emission',async()=>{
 const invalid=structuredClone(binding);
 const index=bindingPayload(invalid).indexes[0];
 expect(index).toBeDefined();
 const target=index?.on[0];
 expect(target&&'field'in target).toBe(true);
 if(!target||!('field'in target))throw new Error('Expected first index target to be a field binding');
 target.field.field='missing';
 await expect(projectDddTablesAndIndexesToPostgresql(logical,invalid,backend,policy,'report')).rejects.toThrow();
},60000);


test('Rust default DDD index retains a quoted physical column containing a dot',async()=>{
 const quoted=structuredClone(binding);
 const payload=bindingPayload(quoted);
 const status=payload.fields.find(row=>row.module==='sales'&&row.element==='Order'&&row.field==='status');
 expect(status).toBeDefined();
 if(!status)throw new Error('Expected status field binding');
 status.column='order.status';
 const firstIndex=payload.indexes[0];
 expect(firstIndex).toBeDefined();
 if(!firstIndex)throw new Error('Expected first index binding');
 payload.indexes=[firstIndex];
 const report=await projectDddTablesAndIndexesToPostgresql(logical,quoted,backend,policy,'report');
 expect(report.status).toBe('reported');
 expect(report.candidate).toContain('CREATE INDEX "orders_btree" ON "sales"."orders" USING btree ("order.status");');
 expect(report.residuals.filter(row=>row.path.startsWith('/extensions/umf.binding/indexes/'))).toEqual([]);
 expect(getPostgresqlSource(report.targetArchive!)).toBe(report.candidate!);
},120000);

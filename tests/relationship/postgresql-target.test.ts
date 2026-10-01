import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {exportPostgresqlSql,getPostgresqlSource,importPostgresqlSql,readDocument,writeDocument} from '../../src';

const base='fixtures/projections/ddd-authored-relationships/';

test('@covers US-048-AC5 @covers US-048-AC7: expected relationship DDL is native-valid and its archive remains recoverable',async()=>{
 const source=await Bun.file(base+'expected-postgresql-relationships.sql').text();
 const oracle=await Bun.file(base+'expected-postgresql-oracle.json').json();
 const browser=await Bun.file(base+'expected-postgresql-browser.json').json();
 const archive=await importPostgresqlSql(source,backend,{id:'expected-relationship-target'});
 expect(getPostgresqlSource(archive)).toBe(source);
 for(const format of ['json','yaml'] as const)expect(getPostgresqlSource(readDocument(writeDocument(archive,format),format))).toBe(source);
 expect(await exportPostgresqlSql(archive,backend)).toContain('fk_order_products_product');
 expect(oracle.observed.serverVersion).toBe('170004');
 expect(oracle.observed.constraints.filter((row:any)=>row.kind==='p')).toHaveLength(4);
 expect(oracle.observed.constraints.filter((row:any)=>row.kind==='f')).toHaveLength(3);
 expect(oracle.observed.constraints.every((row:any)=>row.validated)).toBe(true);
 expect(oracle.observed.constraints.find((row:any)=>row.name==='fk_order_products_order').definition).toContain('REFERENCES sales.orders(id)');
 expect(oracle.observed.constraints.find((row:any)=>row.name==='fk_order_products_product').definition).toContain('REFERENCES sales.products(id)');
 expect(oracle.observed.quantity).toBe('numeric(12,2)|t');
 expect(oracle.observed.indexes).toEqual(['orders_btree','orders_expression','orders_hash','orders_partial','orders_unique']);
 expect(oracle.sha256[base+'expected-postgresql-relationships.sql']).toBe(createHash('sha256').update(source).digest('hex'));
 expect(browser.result.sourceRecovered).toBe(true);expect(browser.result.foreignKeyDeparsed).toBe(true);
 expect(browser.externalRequests).toEqual([]);
});

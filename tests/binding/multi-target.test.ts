import {test,expect} from 'bun:test';
import {inspectBinding,projectBindingIndexes,readBindingDocument,writeBindingDocument,type Document} from '../../src';

const graph=await Bun.file('fixtures/projections/ddd-postgresql-tables/case.json').json();
const delta=await Bun.file('fixtures/projections/ddd-postgresql-tables/delta-binding.json').json();

test('@covers US-046-AC1 @covers US-047-AC1: one authored graph has independent physical target bindings',()=>{
 const logical=graph.logical as Document,postgresql=graph.binding as Document,binding=delta as Document;
 const before=structuredClone(logical),postgresqlBefore=structuredClone(postgresql);
 expect(inspectBinding(postgresql,logical).valid).toBe(true);
 expect(inspectBinding(binding,logical).valid).toBe(true);
 expect(postgresql.id).not.toBe(binding.id);
 expect(postgresql.modules).toEqual([]);expect(binding.modules).toEqual([]);
 const pg=projectBindingIndexes(postgresql,logical,'report');
 const lake=projectBindingIndexes(binding,logical,'report');
 expect(pg.target.system).toBe('postgresql');expect(lake.target.system).toBe('delta');
 expect(pg.outcomes.find(row=>row.name==='orders_clustering')?.outcome).toBe('not-expressible');
 expect(lake.outcomes).toEqual([{name:'orders_tenant_cluster',path:'/extensions/umf.binding/indexes/0',outcome:'exact'}]);
 expect(lake.status).toBe('projected');
 for(const format of ['json','yaml'] as const){
  expect(readBindingDocument(writeBindingDocument(postgresql,logical,format),logical,format)).toEqual(postgresql);
  expect(readBindingDocument(writeBindingDocument(binding,logical,format),logical,format)).toEqual(binding);
 }
 expect(logical).toEqual(before);expect(postgresql).toEqual(postgresqlBefore);
});

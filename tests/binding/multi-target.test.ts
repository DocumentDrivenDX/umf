import {test,expect} from 'bun:test';
import {captureDeltaLog,exportDeltaLog,inspectBinding,projectBindingIndexes,projectBindingToDelta,readBindingDocument,writeBindingDocument,type Document} from '../../src';

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

test('@covers US-046-AC2 @covers US-047-AC3: shared graph Delta clustering is native-readable and unsupported kinds retain residuals',async()=>{
 const base='fixtures/projections/ddd-postgresql-tables/';
 const source=await Bun.file(base+'delta-native.jsonl').text();
 const candidate=await Bun.file(base+'delta-candidate.jsonl').text();
 const oracle=await Bun.file(base+'delta-oracle.json').json();
 const browser=await Bun.file(base+'delta-browser.json').json();
 const native=captureDeltaLog(source,{id:'ddd-order-delta-source'});
 const report=projectBindingToDelta(graph.logical as Document,delta as Document,native,'strict');
 expect(report.status).toBe('projected');
 expect(report.residuals).toEqual([]);
 expect(report.candidate).toBe(candidate);
 expect(exportDeltaLog(report.nativeArchive)).toBe(source);
 expect(oracle.native.runtime).toBe('deltalake 1.6.4');
 expect(oracle.native.sourceBytesRecovered).toBe(true);
 expect(oracle.native.candidateBytesRecovered).toBe(true);
 expect(browser.result.candidate).toBe(candidate);
 expect(browser.result.strictBlocked).toBe(true);
 expect(browser.result.reportResidualized).toBe(true);
 const unsupported=structuredClone(delta) as Document;
 const payload=(unsupported.extensions as Record<string,any>)['umf.binding'];
 payload.indexes.push({name:'unsupported_gin',kind:'gin',on:[{field:{module:'sales',element:'Order',field:'tenant'}}],unique:false});
 const strict=projectBindingToDelta(graph.logical as Document,unsupported,native,'strict');
 const permissive=projectBindingToDelta(graph.logical as Document,unsupported,native,'report');
 expect(strict.status).toBe('blocked');expect(strict.candidate).toBeUndefined();
 expect(permissive.status).toBe('reported');
 expect(permissive.residuals.some(row=>row.path.endsWith('/indexes/1'))).toBe(true);
});

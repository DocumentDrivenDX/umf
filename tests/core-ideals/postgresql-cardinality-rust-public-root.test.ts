// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {classifyPostgresqlCardinality,verifyPostgresqlCardinalityClassification,recoverPostgresqlCardinalitySource,importPostgresqlCatalogCapture,getPostgresqlColumnMetadata} from '../../src/index-node-v4';
const fixture=await Bun.file('fixtures/validation/cardinality-postgresql-catalog-native.json').json();
test('public PostgreSQL cardinality classifier owns exact scalar classification, receipt verification, recovery and strict refusal',()=>{
 const capture=JSON.parse(fixture.captureSource),supplement=structuredClone(fixture.supplement);
 const relation=capture.snapshot.relations.find((r:any)=>r.name==='json_values'),column=relation.columns[0];
 column.type='integer';column.nativeType={schema:'pg_catalog',name:'int4',kind:'b',category:'N',dimensions:0,modifier:-1};
 supplement.columns.find((c:any)=>c.relation==='json_values').type={schema:'pg_catalog',name:'int4'};
 const nativeSource=JSON.stringify(capture),supplementText=JSON.stringify(supplement);
 const source=importPostgresqlCatalogCapture(nativeSource,{id:'pg-cardinality-rust'});
 const selected=getPostgresqlColumnMetadata(source).find(c=>c.relation.name==='json_values')!;
 source.modules.find(m=>m.id==='postgresql.columns')!.elements.find(e=>e.id===selected.path)!.kind='field';
 const request={column:selected.path,nativeSource,supplement:supplementText,mode:'strict' as const,profile:'stored-value' as const};
 const receipt=classifyPostgresqlCardinality(source,request);
 expect(receipt.status).toBe('classified');expect(receipt.mapping.cardinality).toBe('one');expect(receipt.mapping.outcome).toBe('exact');
 expect(verifyPostgresqlCardinalityClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverPostgresqlCardinalitySource(receipt,receipt.target!)).toEqual({nativeSource,supplement:supplementText});
 const refused=classifyPostgresqlCardinality(source,{...request,profile:'unresolved'});
 expect(refused.status).toBe('blocked');expect(refused.diagnostics.some(d=>d.code==='POSTGRESQL_CARDINALITY_UNRESOLVED')).toBe(true);
});

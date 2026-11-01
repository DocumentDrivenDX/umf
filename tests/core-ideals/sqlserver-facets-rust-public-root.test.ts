// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {classifySqlServerFacets,verifySqlServerFacetClassification,recoverSqlServerFacetSource} from '../../src/index-node-v4';
import {sqlserverFacetCase} from '../../scripts/core-ideals/facets-sqlserver-cases';

test('public SQL Server facet classification is Rust-backed and recomputes receipts',()=>{
 const sample=sqlserverFacetCase('signed8');
 const receipt=classifySqlServerFacets(sample.document,sample.request);
 expect(receipt.status).toBe('classified');
 expect(receipt.mapping.facets.integerWidth).toEqual({bits:8,signed:true});
 expect(verifySqlServerFacetClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverSqlServerFacetSource(receipt,receipt.target!)).toBe(sample.request.nativeSource);
 const refusal=classifySqlServerFacets(sample.document,{...sample.request,profile:'unresolved',mode:'strict'});
 expect(refusal.status).toBe('blocked');
 expect(refusal.diagnostics.some(d=>d.code==='SQLSERVER_FACET_UNRESOLVED')).toBe(true);
},30000);

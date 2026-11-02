// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyTableSpecFacets,classifyTableSpecField,importTableSpec,recoverTableSpecFacetSource,verifyTableSpecFacetClassification} from '../../src/index-node-v4';

const sourceText='{"version":"1.0","table_name":"Vectors","columns":[{"name":"value","data_type":"VARCHAR","max_length":12,"future_shape":{"unknown":9007199254740993}}]}\n';
const request={column:0,mode:'strict',profile:'json-schema',input:'raw',obligation:'value-domain'} as const;

test('Node V4 routes TableSpec Facets classification, verification, recovery and refusal through Rust',()=>{
 const imported=importTableSpec(sourceText,{id:'facets-public-root',format:'json'});
 const source=classifyTableSpecField(imported,{column:0,mode:'strict'}).target!;
 const receipt=classifyTableSpecFacets(source,request);
 expect(receipt.status).toBe('classified');
 expect(receipt.mapping.facets.length).toEqual({max:12,unit:'unicode-scalar'});
 expect(receipt.target!.modules[0]!.elements[0]!.facets!.length).toEqual({max:12,unit:'unicode-scalar'});
 expect(verifyTableSpecFacetClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverTableSpecFacetSource(receipt,receipt.target!)).toBe(sourceText);
 const refused=classifyTableSpecFacets(source,{...request,mode:'strict',profile:'unresolved'});
 expect(refused.status).toBe('blocked');
 expect(refused.target).toBeUndefined();
 expect(refused.diagnostics.some(diagnostic=>diagnostic.code==='TABLESPEC_FACET_UNRESOLVED')).toBe(true);
});

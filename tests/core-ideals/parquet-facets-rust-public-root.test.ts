// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyParquetFacets,verifyParquetFacetClassification,recoverParquetFacetSource,type ParquetFacetRequest} from '../../src/index-node-v4';
import {importParquetSchema} from '../../src/adapters/parquet/field-metadata';

test('Node V4 Parquet facets classify, verify, recover, and refuse through Rust',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/facets/int8-min-plain.parquet').arrayBuffer());
 const source=importParquetSchema(bytes,{id:'parquet-facets'});
 source.modules.push({id:'logical',namespace:'',elements:[{id:'value',kind:'field',cardinality:'one',scalarType:'integer',extensions:{}}]});
 const request:ParquetFacetRequest={location:{index:1,scope:'present-non-null-leaf'},identity:{module:'logical',element:'value'},mode:'strict',profile:'declared-schema',obligation:'value-domain'};
 const receipt=classifyParquetFacets(source,request);
 expect(receipt.status).toBe('classified');expect(receipt.mapping.facets.integerWidth).toEqual({bits:8,signed:true});
 expect(verifyParquetFacetClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverParquetFacetSource(receipt,receipt.target!)).toEqual(bytes);
 const mismatch={...source,modules:source.modules.map(m=>m.id==='logical'?{...m,elements:m.elements.map(e=>({...e,scalarType:'string' as const}))}:m)};
 expect(classifyParquetFacets(mismatch,request).status).toBe('blocked');
},60000);

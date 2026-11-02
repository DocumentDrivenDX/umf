// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import * as u from '../../src/index-node-v4';
import type {AvroFacetRequest} from '../../src/core-ideals/facets-avro';

function input(scalarType:'integer'|'string'='integer') {
  const source=u.importAvroSchema('"int"',{id:'facet-native'});
  source.modules.push({id:'logical',namespace:'',elements:[{id:'value',kind:'field',cardinality:'one',scalarType,extensions:{}}]});
  const request:AvroFacetRequest={location:{path:''},nativeSource:'"int"',identity:{module:'logical',element:'value'},mode:'strict',profile:'declared-schema',obligation:'value-domain'};
  return {source,request};
}

test('Node V4 classifies declared Avro facets and recovers the exact retained bundle',()=>{
  const {source,request}=input();
  const author=u.declareCoreFacets(source,{module:'logical',element:'value'},{integerWidth:{bits:32,signed:true}});
  const receipt=u.classifyAvroFacets(author.target!,{...request,author});
  expect(receipt.status).toBe('classified');
  expect(receipt.mapping.facets.integerWidth).toEqual({bits:32,signed:true});
  expect(u.verifyAvroFacetClassification(receipt,receipt.target!)).toEqual(receipt);
  expect(u.recoverAvroFacetSource(receipt,receipt.target!)).toEqual({schema:'"int"',dependencies:[]});
});

test('Node V4 refuses to relabel a native integer as a different logical scalar',()=>{
  const {source,request}=input('string');
  const receipt=u.classifyAvroFacets(source,request);
  expect(receipt.status).toBe('blocked');
  expect(receipt.diagnostics.some(d=>d.code==='AVRO_FACET_CONFLICT')).toBe(true);
});

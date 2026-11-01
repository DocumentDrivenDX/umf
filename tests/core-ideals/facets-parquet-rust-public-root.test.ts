// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {declareCoreFacets,exportParquetCapture,projectFacetsToParquet,recoverFacetsFromParquet,type Document,type FacetsParquetRequest} from '../../src/index-node-v4';

test('Node V4 authors and recovers a Parquet facet projection through Rust',()=>{
 const source:Document={umf:'0.10.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',scalarType:'integer',extensions:{}}]}]};
 const author=declareCoreFacets(source,{module:'m',element:'f'},{integerWidth:{bits:32,signed:true}});
 const request:FacetsParquetRequest={id:'projection',recordName:'Example',fieldName:'value',nullable:false,carrier:{kind:'integer',bits:32,signed:true},mode:'report',encoding:'native-type',profile:'declared-schema',obligation:'value-domain'};
 const receipt=projectFacetsToParquet(author,request);
 expect(receipt.status).toBe('projected');expect(receipt.mapping.facets).toEqual({integerWidth:{bits:32,signed:true}});
 expect(recoverFacetsFromParquet(receipt,exportParquetCapture(receipt.target!))).toEqual(author.target);
 const refused=projectFacetsToParquet(author,{...request,carrier:{kind:'primitive',nativeType:'int64'},mode:'strict'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});

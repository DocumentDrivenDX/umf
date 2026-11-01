import {expect,test} from 'bun:test';
import {declareCoreFacets,exportTableSpec,projectFacetsToTableSpec,recoverFacetsFromTableSpec,projectKeysToTableSpec,verifyKeysTableSpecProjection,recoverKeysTableSpecIdeal,type Document} from '../../src/index-node-v4';
import {tableSpecKeyAuthors} from '../../scripts/core-ideals/key-tablespec-projection-cases';
import {facetProjectionSource} from '../../scripts/core-ideals/facets-tablespec-projection-cases';

test('Node V4 routes authored TableSpec Keys projection, refusal, verification and recovery through Rust',()=>{
 const row=tableSpecKeyAuthors();
 const result=projectKeysToTableSpec(row.source,row.authors,row.request);
 expect(result.status).toBe('projected');
 expect(verifyKeysTableSpecProjection(result,result.target!)).toEqual(result);
 expect(recoverKeysTableSpecIdeal(result,result.target!)).toEqual(row.source);
 const refused=projectKeysToTableSpec(row.source,row.authors,{...row.request,mode:'strict'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});

test('Node V4 routes authored TableSpec Facets projection, refusal and recovery through Rust',()=>{
 const source:Document=facetProjectionSource('string');
 const author=declareCoreFacets(source,{module:'m',element:'value'},{length:{max:2,unit:'unicode-scalar'}});
 const request={id:'native',tableName:'Facets',columnName:'value',nativeType:'VARCHAR',profile:'json-schema',input:'raw',obligation:'value-domain',mode:'report'} as const;
 const result=projectFacetsToTableSpec(author,request);
 expect(result.status).toBe('projected');
 expect(recoverFacetsFromTableSpec(result,exportTableSpec(result.target!))).toEqual(author.target);
 const refused=projectFacetsToTableSpec(author,{...request,nativeType:'BOOLEAN',mode:'strict'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();
});

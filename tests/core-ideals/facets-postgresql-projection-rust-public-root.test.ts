// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import * as u from '../../src/index-node-v4';
import {backend} from '../../native/postgresql/runtime';

test('PostgreSQL authored facets project, recover, and refuse an unexpressed strict carrier',async()=>{
 const source:u.Document={umf:'0.10.0',id:'facet-native-root',vocabularies:{},modules:[{id:'m',namespace:'sales',elements:[{id:'value',name:'value',kind:'field',scalarType:'integer',extensions:{}}]}]};
 const author=u.declareCoreFacets(source,{module:'m',element:'value'},{integerWidth:{bits:8,signed:true}});
 const request={id:'facet-native-root-target',namespace:'sales',tableName:'simple',columnName:'value',nativeType:'smallint',mode:'strict',encoding:'checked',obligation:'value-domain'} as const;
 const projected=await u.projectFacetsToPostgresql(author,request,backend);
 expect(projected.status).toBe('projected');
 expect(projected.mapping.facets).toEqual({integerWidth:{bits:8,signed:true}});
 expect(projected.nativeSql).toContain('OPERATOR(pg_catalog.>=) -128');
 expect(await u.recoverFacetsFromPostgresql(projected,projected.nativeSql!,backend)).toEqual(author.target);
 const refused=await u.projectFacetsToPostgresql(author,{...request,encoding:'carrier-only'},backend);
 expect(refused.status).toBe('blocked');
 expect(refused.target).toBeUndefined();
 expect(refused.residuals.some(row=>row.path.endsWith('/facets/integerWidth'))).toBe(true);
});

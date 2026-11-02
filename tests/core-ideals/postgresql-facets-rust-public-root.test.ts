// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlCatalogCapture,classifyPostgresqlFacets,verifyPostgresqlFacetClassification,recoverPostgresqlFacetSource} from '../../src/index-node-v4';
import {postgresqlFacetRequest} from '../../scripts/core-ideals/facets-postgresql-cases';
import evidence from '../../fixtures/validation/facets-postgresql-constraints-native.json';

// Derived focused input keeps the complete signed8 relation and matching supplement inventory;
// the original native capture remains unchanged.
const nativeCapture=JSON.parse(evidence.sourceText);
nativeCapture.snapshot.relations=nativeCapture.snapshot.relations.filter((relation:{name:string})=>relation.name==='signed8');
if(nativeCapture.snapshot.relations.length!==1)throw new Error('Expected the focused signed8 fixture relation');
const nativeSource=JSON.stringify(nativeCapture);
const supplementCapture=structuredClone(evidence.capture);
supplementCapture.constraints=supplementCapture.constraints.filter((constraint:{relation:string})=>constraint.relation==='signed8');
const supplement=JSON.stringify(supplementCapture);
const source=()=>{
 const document=importPostgresqlCatalogCapture(nativeSource,{id:'postgresql-facets-rust'});
 for(const element of document.modules.find(module=>module.id==='postgresql.columns')!.elements)element.kind='field';
 return document;
};

test('Rust PostgreSQL Facets public root classifies, verifies, recovers and refuses strict residuals',async()=>{
 const document=source(),request={...postgresqlFacetRequest(document,'signed8'),nativeSource,supplement};
 const classified=await classifyPostgresqlFacets(document,request,backend);
 expect(classified.status).toBe('classified');
 expect(classified.mapping.facets).toEqual({integerWidth:{bits:8,signed:true}});
 expect((await verifyPostgresqlFacetClassification(classified,classified.target!,backend)).status).toBe('classified');
 expect(await recoverPostgresqlFacetSource(classified,classified.target!,backend)).toEqual({nativeSource:request.nativeSource,supplement:request.supplement});
 const strict=await classifyPostgresqlFacets(document,{...request,mode:'strict',profile:'unresolved'},backend);
 expect(strict.status).toBe('blocked');
 expect(strict.target).toBeUndefined();
});

test('Rust PostgreSQL Facets preserves explicit parser callback failures',async()=>{
 const document=source(),request={...postgresqlFacetRequest(document,'signed8'),nativeSource,supplement},failure=new Error('caller parser failure');
 await expect(classifyPostgresqlFacets(document,request,{...backend,parse:async()=>{throw failure}})).rejects.toBe(failure);
});

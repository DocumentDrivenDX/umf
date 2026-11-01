// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {exportPostgresqlCatalogCapture,findPostgresqlCatalogRelation,getPostgresqlCatalogNode,getPostgresqlCatalogReconstruction,getPostgresqlColumnMetadata,importPostgresqlCatalogCapture,inspectPostgresqlCatalog,proposePostgresqlCatalogEdit,queryPostgresqlCatalogDependencies} from '../../src/index-node-v4';

const original=JSON.parse(await Bun.file('fixtures/postgresql/catalog-capture.json').text());
// Derived ordinary view: one relation and its incoming address dependency rows.
// Original opaque query/reconstruction content and the shared fixture stay intact.
const capture=JSON.stringify({...original,snapshot:{...original.snapshot,
 relations:original.snapshot.relations.filter((row:{schema:string;name:string})=>row.schema==='sales'&&row.name==='orders'),
 functions:[],triggers:[],
 dependencies:original.snapshot.dependencies.filter((row:{referenced:{identity:string}})=>row.referenced.identity==='sales.address'),
}});

test('public PostgreSQL catalog operations use the native capture owner',()=>{
 const extended=capture.trim().slice(0,-1)+',"future":{"exact":9007199254740993.000000001}}';
 const document=importPostgresqlCatalogCapture(extended,{id:'catalog-rust'});
 expect(inspectPostgresqlCatalog(document).valid).toBe(true);
 expect(inspectPostgresqlCatalog(document).diagnostics.some(d=>d.severity==='error')).toBe(false);
 expect(inspectPostgresqlCatalog(document).diagnostics.some(d=>d.code==='POSTGRESQL_CATALOG_UNKNOWN')).toBe(true);
 const columns=getPostgresqlColumnMetadata(document);expect(columns.length).toBeGreaterThan(0);
 expect(columns[0]?.element.id).toMatch(/^\/snapshot\/relations\//);
 const exported=exportPostgresqlCatalogCapture(document).json;
 expect(JSON.parse(exported)).toEqual(JSON.parse(extended));
 expect(exported).toContain('9007199254740993.000000001');
 expect(getPostgresqlCatalogReconstruction(document).sql).toBe(JSON.parse(capture).reconstruction.sql);
 expect(findPostgresqlCatalogRelation(document,{schema:'sales',name:'orders'})?.kind).toBe('object');
 const incoming=queryPostgresqlCatalogDependencies(document,{side:'referenced',object:{catalog:'pg_type',type:'type',identity:'sales.address'}});
 expect(incoming.available).toBe(true);expect(incoming.complete).toBe(false);expect(incoming.edges.length).toBeGreaterThan(0);
 const edit=proposePostgresqlCatalogEdit(document,'/snapshot/types/0/name','"catalog_rust_edit"');
 expect(edit.document.modules.find(m=>m.id==='catalog')?.elements[0]?.extensions['umf.postgresql.catalog']).toBeDefined();
 expect(getPostgresqlCatalogNode(edit.document,'/state')).toEqual({kind:'string',value:'modified'});
 expect(edit.validation.complete).toBe(false);
 expect(()=>getPostgresqlCatalogReconstruction(edit.document)).toThrow('does not synchronize');
});

test('native catalog editing refuses invalid replacements and representation loss',()=>{
 const document=importPostgresqlCatalogCapture(capture,{id:'catalog-rust-refusal'});
 expect(()=>proposePostgresqlCatalogEdit(document,'/serverVersion','16')).toThrow();
 const withUnknown=structuredClone(document);
 (withUnknown.modules[0]!.elements[0]!.extensions['umf.postgresql.catalog'] as Record<string,unknown>).future={keep:true};
 expect(()=>exportPostgresqlCatalogCapture(withUnknown)).toThrow('Unknown');
 expect(()=>proposePostgresqlCatalogEdit(withUnknown,'/snapshot/types/0/name','"would_drop_payload"')).toThrow('Unknown');
});

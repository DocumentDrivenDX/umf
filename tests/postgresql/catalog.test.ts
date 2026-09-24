import {test,expect} from 'bun:test';
import {importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,inspectPostgresqlCatalog,findPostgresqlCatalogRelation,proposePostgresqlCatalogEdit,getPostgresqlCatalogReconstruction,getPostgresqlCatalogNode,queryPostgresqlCatalogDependencies,readDocument,writeDocument} from '../../src';
const source=await Bun.file('fixtures/postgresql/catalog-capture.json').text();
test('US-015-AC6: captured PostgreSQL metadata, exact unknowns and reconstruction archives survive both UMF formats',()=>{
 const extended=source.trim().slice(0,-1)+',"future":{"exact":9007199254740993.000000001}}';
 const doc=importPostgresqlCatalogCapture(extended,{id:'capture'});
 expect(inspectPostgresqlCatalog(doc).complete).toBe(false);expect(inspectPostgresqlCatalog(doc).diagnostics.some(d=>d.code==='POSTGRESQL_CATALOG_UNKNOWN')).toBe(true);
 for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format);expect(exportPostgresqlCatalogCapture(restored)).toEqual(exportPostgresqlCatalogCapture(doc));expect(exportPostgresqlCatalogCapture(restored).json).toContain('9007199254740993.000000001');expect(getPostgresqlCatalogReconstruction(restored).sql).toBe(JSON.parse(source).reconstruction.sql);}
 const orders=findPostgresqlCatalogRelation(doc,{schema:'sales',name:'orders'});expect(orders?.kind).toBe('object');
 if(orders?.kind!=='object')throw Error();orders.members.name={kind:'string',value:'local-change'};expect(findPostgresqlCatalogRelation(doc,{schema:'sales',name:'orders'})?.kind).toBe('object');
 expect(findPostgresqlCatalogRelation(doc,{schema:'support',name:'orders'})).toBeUndefined();
});
test('US-015-AC6: candidate edits cannot expose stale reconstruction SQL as synchronized',()=>{
 const doc=importPostgresqlCatalogCapture(source,{id:'edit'});
 const edit=proposePostgresqlCatalogEdit(doc,'/snapshot/types/0/name','"changed_amount"');
 expect(()=>getPostgresqlCatalogReconstruction(importPostgresqlCatalogCapture(exportPostgresqlCatalogCapture(edit.document).json,{id:'native-reimport'}))).toThrow('does not synchronize');
 expect(exportPostgresqlCatalogCapture(edit.document).state).toBe('modified');expect(edit.validation.complete).toBe(false);
 expect(()=>getPostgresqlCatalogReconstruction(edit.document)).toThrow('does not synchronize');
 expect(getPostgresqlCatalogNode(doc,'/snapshot/types/0/name')).toEqual({kind:'string',value:'money_amount'});
 for(const format of ['json','yaml'] as const)expect(()=>getPostgresqlCatalogReconstruction(readDocument(writeDocument(edit.document,format),format))).toThrow('does not synchronize');
 expect(()=>proposePostgresqlCatalogEdit(doc,'/serverVersion','16')).toThrow();
});
test('US-015-AC6: ambiguity and unknown representation data are preserved and reported',()=>{
 const v=JSON.parse(source);v.snapshot.relations.push(v.snapshot.relations.find((r:any)=>r.schema==='sales'&&r.name==='orders'));
 const doc=importPostgresqlCatalogCapture(JSON.stringify(v),{id:'ambiguous'});expect(()=>findPostgresqlCatalogRelation(doc,{schema:'sales',name:'orders'})).toThrow('Duplicate');
 (doc.modules[0]!.elements[0]!.extensions['umf.postgresql.catalog'] as any).future={keep:true};
 expect(readDocument(writeDocument(doc,'yaml'),'yaml')).toEqual(doc);expect(()=>exportPostgresqlCatalogCapture(doc)).toThrow('Unknown representation');
});
test('US-015-AC6: unsupported minor-version evidence and conflicting capture state cannot overclaim readiness',()=>{
 const v=JSON.parse(source);v.serverVersion=170011;
 const doc=importPostgresqlCatalogCapture(JSON.stringify(v),{id:'different-minor'});
 expect(inspectPostgresqlCatalog(doc).diagnostics.some(d=>d.code==='POSTGRESQL_CATALOG_VERSION')).toBe(true);
 expect(exportPostgresqlCatalogCapture(doc).complete).toBe(false);
 (doc.modules[0]!.elements[0]!.extensions['umf.postgresql.catalog'] as any).state='modified';
 expect(inspectPostgresqlCatalog(doc).valid).toBe(false);
});
test('US-015-AC7: v1 captures remain readable while v2 requires its additional native object families',async()=>{
 const legacy=await Bun.file('fixtures/postgresql/catalog-capture-v1.json').text();
 const old=importPostgresqlCatalogCapture(legacy,{id:'legacy'});expect(exportPostgresqlCatalogCapture(old).state).toBe('captured');expect(getPostgresqlCatalogNode(old,'/snapshot/profile')).toEqual({kind:'string',value:'umf-postgresql-catalog-evidence-17-v1'});
 const v2=JSON.parse(await Bun.file('fixtures/postgresql/catalog-capture-v2.json').text());expect(v2.snapshot.profile).toBe('umf-postgresql-catalog-evidence-17-v2');
 for(const field of ['triggers','compositeTypes','rangeTypes','collations']){
  const copy=structuredClone(v2);delete copy.snapshot[field];expect(()=>importPostgresqlCatalogCapture(JSON.stringify(copy),{id:'missing-'+field})).toThrow();
 }
 const doc=importPostgresqlCatalogCapture(JSON.stringify(v2),{id:'v2'});
 expect(getPostgresqlCatalogNode(doc,'/snapshot/triggers/0/name')).toEqual({kind:'string',value:'normalize_inventory'});
 expect(getPostgresqlCatalogNode(doc,'/snapshot/compositeTypes/0/name')).toEqual({kind:'string',value:'address'});
 expect(getPostgresqlCatalogNode(doc,'/snapshot/rangeTypes/0/multirange')).toEqual({kind:'string',value:'sales.price_spans'});
 expect(getPostgresqlCatalogNode(doc,'/snapshot/collations/0/provider')).toEqual({kind:'string',value:'c'});
 const edited=proposePostgresqlCatalogEdit(doc,'/snapshot/triggers/0/enabled','"D"');expect(edited.validation.diagnostics.some(d=>d.code==='POSTGRESQL_CATALOG_MODIFIED')).toBe(true);expect(()=>getPostgresqlCatalogReconstruction(edited.document)).toThrow('does not synchronize');
});

test('US-015-AC8: dependency identities distinguish native objects and preserve copied edges',async()=>{
 const doc=importPostgresqlCatalogCapture(source,{id:'dependencies'});
 const object={catalog:'pg_type',type:'type',identity:'sales.address'};
 const incoming=queryPostgresqlCatalogDependencies(doc,{side:'referenced',object});
 expect(incoming.available).toBe(true);expect(incoming.complete).toBe(false);expect(incoming.edges.length).toBe(3);
 expect(incoming.edges.some(e=>e.kind==='object'&&e.members.kind?.kind==='string'&&e.members.kind.value==='n')).toBe(true);
 const sameNameDifferentObject=queryPostgresqlCatalogDependencies(doc,{side:'referenced',object:{...object,catalog:'pg_class',type:'composite type'}});
 expect(sameNameDifferentObject.edges).not.toEqual(incoming.edges);
 const first=incoming.edges[0];if(first?.kind!=='object')throw Error();first.members.kind={kind:'string',value:'changed-locally'};
 expect(queryPostgresqlCatalogDependencies(doc,{side:'referenced',object}).edges).not.toEqual(incoming.edges);
 const v2=importPostgresqlCatalogCapture(await Bun.file('fixtures/postgresql/catalog-capture-v2.json').text(),{id:'legacy'});
 expect(queryPostgresqlCatalogDependencies(v2).available).toBe(false);
 const noMatches=queryPostgresqlCatalogDependencies(doc,{side:'referenced',object:{...object,identity:'absent.type'}});expect(noMatches.available).toBe(true);expect(noMatches.edges).toEqual([]);
 const v3=JSON.parse(source);delete v3.snapshot.dependencies;expect(()=>importPostgresqlCatalogCapture(JSON.stringify(v3),{id:'incomplete'})).toThrow();
});

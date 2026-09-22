import {test,expect} from 'bun:test';
import * as u from '../../src';
import {facetTableSpecCases,tableSpecFacetSource} from '../../scripts/core-ideals/facets-tablespec-cases';
const identity={module:'table',element:'column:0'};
const request={column:0,mode:'strict',profile:'gx-spark',input:'raw',obligation:'value-domain'} as const;
const source=(column:Record<string,unknown>)=>tableSpecFacetSource(JSON.stringify({version:'1.0',table_name:'Facets',columns:[{name:'value',data_type:'VARCHAR',...column}]}));
test('profile-qualified classification keeps exact source and native tokens through both receipt formats',()=>{
 const rows=facetTableSpecCases();expect(rows).toHaveLength(1216);
 for(const row of rows){
  const before=u.copyJson(row.source),r=u.classifyTableSpecFacets(row.source,row.request);expect(u.copyJson(row.source)).toEqual(before);
  if(r.status==='blocked'){expect(r.target).toBeUndefined();expect(r.residuals.length).toBeGreaterThan(0);continue;}
  if(row.request.mode==='strict'){expect(r.residuals).toHaveLength(0);expect(r.outcome).toBe('exact');}
  expect(r.target!.extensions).toEqual(row.source.extensions);
  for(const format of ['json','yaml'] as const){const recovered=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as u.TableSpecFacetClassification;expect(u.recoverTableSpecFacetSource(recovered,recovered.target!)).toBe(row.text);}
 }
},300000);
test('length meaning depends on raw/normalized input and consumer, with ignored conflicts retained',()=>{
 const doc=source({length:1,max_length:2,future:{unknown:[false,7]}});
 const report=u.classifyTableSpecFacets(doc,{...request,mode:'report'});expect(report.mapping.facets.length).toEqual({max:2,unit:'unicode-scalar'});expect(report.residuals.some(r=>r.path.endsWith('/length'))).toBe(true);
 expect(u.classifyTableSpecFacets(doc,request).status).toBe('blocked');
 const normalized=u.classifyTableSpecFacets(doc,{...request,input:'model-normalized',mode:'report'});expect(normalized.mapping.facets.length).toEqual({max:1,unit:'unicode-scalar'});expect(normalized.residuals.some(r=>r.path.endsWith('/max_length'))).toBe(true);
 const json=u.classifyTableSpecFacets(source({length:2}),{...request,profile:'json-schema',mode:'report'});expect(json.mapping.facets).toEqual({});expect(json.residuals.length).toBeGreaterThan(0);
 expect(u.classifyTableSpecFacets(source({max_length:2}),{...request,profile:'json-schema'}).mapping.facets.length).toEqual({max:2,unit:'unicode-scalar'});
 expect(u.classifyTableSpecFacets(source({length:2}),request).mapping.facets.length).toEqual({max:2,unit:'unicode-scalar'});
 expect(u.classifyTableSpecFacets(source({length:2}),{...request,profile:'pyspark-schema'}).status).toBe('blocked');
 for(const length of [0,-1,1.5,'2',true])expect(u.classifyTableSpecFacets(source({length}),request).status).toBe('blocked');
});
test('decimal declarations, enforced domains, defaults and exact conversion are independent',()=>{
 const doc=source({data_type:'DECIMAL',precision:5,scale:2});
 expect(u.classifyTableSpecFacets(doc,{...request,profile:'declared-metadata'}).mapping.facets).toEqual({precision:5,scale:2});
 expect(u.classifyTableSpecFacets(doc,{...request,profile:'ingest-cast'}).mapping.facets).toEqual({precision:5,scale:2});
 expect(u.classifyTableSpecFacets(doc,{...request,profile:'pyspark-schema'}).status).toBe('blocked');
 expect(u.classifyTableSpecFacets(doc,{...request,profile:'ingest-cast',obligation:'exact-input'}).status).toBe('blocked');
 const lossy=u.classifyTableSpecFacets(doc,{...request,profile:'ingest-cast',obligation:'exact-input',mode:'report'});expect(lossy.outcome).toBe('approximated');expect(lossy.target!.modules[0]!.elements[0]!.facets).toEqual({precision:5,scale:2});
 for(const column of [{precision:39,scale:2},{precision:2,scale:5},{precision:5},{scale:2},{precision:'5',scale:'2'}])expect(u.classifyTableSpecFacets(source({data_type:'DECIMAL',...column}),{...request,profile:'ingest-cast'}).status).toBe('blocked');
 for(const profile of ['declared-metadata','pyspark-schema','ingest-cast'] as const)expect(u.classifyTableSpecFacets(source({data_type:'DECIMAL'}),{...request,profile}).mapping.facets).toEqual({});
 const integer=u.classifyTableSpecFacets(source({data_type:'INTEGER'}),{...request,profile:'pyspark-schema'});expect(integer.mapping.facets.integerWidth).toEqual({bits:32,signed:true});expect(integer.mapping.observations[0]!.interpretation).toBe('inferred');
 expect(u.classifyTableSpecFacets(source({data_type:'FLOAT'}),{...request,profile:'pyspark-schema',obligation:'exact-input'}).status).toBe('blocked');
});
test('authored facets, unknown qualifiers and shape conflicts cannot be overwritten',()=>{
 const doc=source({length:2}),authored=u.declareCoreFacets(doc,identity,{length:{max:2,unit:'unicode-scalar'}});
 expect(u.classifyTableSpecFacets(authored.target,request).status).toBe('blocked');
 expect(u.classifyTableSpecFacets(authored.target,{...request,author:authored}).status).toBe('classified');
 const conflict=u.declareCoreFacets(doc,identity,{length:{max:1,unit:'unicode-scalar'}});
 for(const mode of ['strict','report'] as const)expect(u.classifyTableSpecFacets(conflict.target,{...request,mode,author:conflict}).status).toBe('blocked');
 const unknown=u.copyJson(doc) as unknown as u.Document;unknown.modules[0]!.elements[0]!.facets={future:{x:[1]},length:{max:2,unit:'unicode-scalar',futureUnit:{x:1}}};
 const qualified=u.declareCoreFacets(unknown,identity,{length:{max:2,unit:'unicode-scalar'}}),r=u.classifyTableSpecFacets(qualified.target,{...request,mode:'report',author:qualified});expect(r.status).toBe('classified');expect(r.target!.modules[0]!.elements[0]!.facets).toEqual(qualified.target.modules[0]!.elements[0]!.facets);expect(r.outcome).toBe('unknown');
 for(const cardinality of ['array','map','future']){const shaped=source({data_type:'EMBEDDING',dimension:3});shaped.modules[0]!.elements[0]!.cardinality=cardinality;expect(u.classifyTableSpecFacets(shaped,{...request,mode:'report'}).status).toBe('blocked');}
 const result=u.classifyTableSpecFacets(doc,request);expect(u.classifyTableSpecFacets(result.target!,request).status).toBe('blocked');
});
test('forged/stale receipts, invalid requests and accessors refuse; independent reads do not mutate source',()=>{
 const doc=source({length:2}),r=u.classifyTableSpecFacets(doc,request);
 const edited=u.copyJson(r.target) as unknown as u.Document;edited.modules[0]!.elements[0]!.facets={length:{max:1,unit:'unicode-scalar'}};expect(()=>u.recoverTableSpecFacetSource(r,edited)).toThrow();
 const forged=u.copyJson(r) as unknown as u.TableSpecFacetClassification;forged.mapping.facets.length!.max=1;expect(()=>u.recoverTableSpecFacetSource(forged,r.target!)).toThrow();
 for(const options of [{...request,column:-1},{...request,profile:'future'},{...request,input:'implicit'},{...request,obligation:'none'},{...request,extra:true}])expect(()=>u.classifyTableSpecFacets(doc,options as never)).toThrow();
 let calls=0;expect(()=>u.classifyTableSpecFacets(doc,{...request,get profile(){calls++;return 'gx-spark' as const;}})).toThrow();expect(calls).toBe(0);
 const future=source({length:2,length_unit:'future'});expect(u.classifyTableSpecFacets(future,request).status).toBe('blocked');expect(u.classifyTableSpecFacets(future,{...request,mode:'report'}).outcome).toBe('unknown');
});

test('published facet extension validates its profile and preserves unknown future payload members',()=>{
 const r=u.classifyTableSpecFacets(source({length:2}),request),registry=new u.Registry().register(u.tablespecPackage).register(u.tableSpecFacetsPackage);
 expect(u.validateDocument(r.target!,registry).valid).toBe(true);
 const target=u.copyJson(r.target) as unknown as u.Document,payload=target.modules[0]!.elements[0]!.extensions[u.TABLESPEC_FACETS_EXTENSION] as Record<string,unknown>;
 payload.future={unknown:[1,null]};expect(u.validateDocument(target,registry).valid).toBe(true);expect(()=>u.verifyTableSpecFacetClassification(r,target)).toThrow();
 payload.profile='unregistered-future';expect(u.validateDocument(target,registry).valid).toBe(false);
});

test('exact lexical checks and split archives retain unclaimed content',()=>{
 for(const token of ['1.0000000000000000001','9007199254740993','1e100000']){const text='{"version":"1.0","table_name":"Lexical","columns":[{"name":"value","data_type":"VARCHAR","length":'+token+'}]}',doc=tableSpecFacetSource(text);expect(u.classifyTableSpecFacets(doc,request).status).toBe('blocked');const report=u.classifyTableSpecFacets(doc,{...request,mode:'report'});expect(u.recoverTableSpecFacetSource(report,report.target!)).toBe(text);}
 const files={'table.yaml':'version: "1.0"\ntable_name: Split\nfuture: 9007199254740993\n','columns/a.yaml':'column: {name: a, data_type: VARCHAR, length: 20}\nfutureSibling: retained\n','notes.txt':'opaque future bytes\n'};
 const imported=u.importTableSpecBundle(files,{id:'split-facets'}),field=u.classifyTableSpecField(u.upgradeFieldEnvelope(imported).target,{column:0,mode:'strict'}).target!;
 const doc=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(field).target).target).target,r=u.classifyTableSpecFacets(doc,request);expect(r.status).toBe('classified');
 for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as u.TableSpecFacetClassification;expect(u.recoverTableSpecFacetSource(receipt,receipt.target!)).toEqual(files);}
});

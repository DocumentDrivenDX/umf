import {test,expect} from 'bun:test';
import * as u from '../../src';
import {classifyAvroFacets as classify,recoverAvroFacetSource as recover,avroFacetsPackage,AVRO_FACETS_EXTENSION,type AvroFacetRequest} from '../../src/core-ideals/facets-avro';
function sample(nativeSource='"int"',scalarType:u.ScalarType='integer',options:Partial<AvroFacetRequest>={}){
 const dependencies=options.dependencies;
 const native=u.importAvroSchema(nativeSource,{id:'avro-facets',...(dependencies?{dependencies}:{})});
 const document=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(native).target).target).target).target;
 document.modules.push({id:'logical',namespace:'',elements:[{id:'value',kind:'field',cardinality:'one',scalarType,extensions:{}}]});
 const request:AvroFacetRequest={location:{path:''},nativeSource,identity:{module:'logical',element:'value'},mode:'report',profile:'declared-schema',obligation:'value-domain',...options};
 return {document,request};
}
function run(text='"int"',family:u.ScalarType='integer',options:Partial<AvroFacetRequest>={}){const c=sample(text,family,options);return classify(c.document,c.request);}
test('declaration and writer profiles separate native domain from enforcement counterexamples',()=>{
 expect(run('"int"','integer',{mode:'strict'}).mapping.facets.integerWidth).toEqual({bits:32,signed:true});
 expect(run('"long"','integer',{mode:'strict',profile:'apache-datum-writer'}).status).toBe('classified');
 const fast=run('"int"','integer',{profile:'fastavro-schemaless-writer'});expect(fast.outcome).toBe('approximated');expect(fast.mapping.facets.integerWidth?.bits).toBe(32);
 expect(run('"int"','integer',{profile:'fastavro-schemaless-writer',mode:'strict'}).status).toBe('blocked');
 const decimal='{"type":"bytes","logicalType":"decimal","precision":3,"scale":2}';
 expect(run(decimal,'decimal',{mode:'strict'}).mapping.facets).toEqual({precision:3,scale:2});
 for(const profile of ['apache-datum-writer','fastavro-schemaless-writer'] as const){expect(run(decimal,'decimal',{profile,mode:'strict'}).status).toBe('blocked');expect(run(decimal,'decimal',{profile}).residuals.length).toBeGreaterThan(0);}
 expect(run('"float"','float',{obligation:'exact-input'}).residuals.some(r=>r.reason.includes('1.0000000000000002'))).toBe(true);
 expect(run('"long"','integer',{profile:'unresolved',mode:'strict'}).status).toBe('blocked');
},30000);
test('fixed, union and explicit item selection retain native refinements',()=>{
 expect(run('{"type":"fixed","name":"Empty","size":0}','binary',{mode:'strict'}).mapping.facets.length).toEqual({max:0,unit:'byte'});
 const fixed=run('{"type":"fixed","name":"B","size":2}','binary');expect(fixed.mapping.facets.length).toEqual({max:2,unit:'byte'});expect(fixed.outcome).toBe('not-expressible');
 const union=run('["null","int","long"]','integer',{mode:'strict'});expect(union.status).toBe('classified');expect(union.mapping.facets.integerWidth).toEqual({bits:64,signed:true});expect(union.mapping.branches.map(b=>b.facets.integerWidth?.bits??null)).toEqual([null,32,64]);
 const array='{"type":"array","items":"int"}';expect(run(array,'integer',{mode:'strict'}).status).toBe('blocked');expect(run(array,'integer',{location:{path:'/items'},mode:'strict'}).mapping.facets.integerWidth?.bits).toBe(32);
 const mixed=run('["int","string"]');expect(mixed.mapping.facets).toEqual({});expect(mixed.residuals.length).toBeGreaterThan(0);
},30000);
test('original source texts, dependency order, unknown numeric tokens and defaults recover exactly',()=>{
 const dependencies=[{id:'d',schema:' {"type":"fixed","name":"Money","size":2,"logicalType":"decimal","precision":4,"scale":2,"future":9007199254740993} \n'}];
 const text='\n {"type":"record","name":"R","fields":[{"name":"v","type":["null","Money"],"default":null}]}\n';
 const c=sample(text,'decimal',{dependencies,location:{path:'/fields/0/type'}}),r=classify(c.document,c.request);expect(r.status).toBe('classified');expect(r.residuals.some(r=>r.location.dependencyId==='d'&&r.location.path==='/future')).toBe(true);
 const before=u.exportAvroBundle(c.document),after=u.exportAvroBundle(r.target!);expect(after.schema).toBe(before.schema);expect(after.dependencies).toEqual(before.dependencies);
 for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(r),format),format) as unknown as typeof r;expect(recover(receipt,receipt.target!)).toEqual({schema:text,dependencies});}
 expect(classify(c.document,{...c.request,mode:'strict'}).status).toBe('blocked');
},30000);
test('authored bounds require fresh provenance and cannot be silently overwritten',()=>{
 const c=sample(),author=u.declareCoreFacets(c.document,c.request.identity,{integerWidth:{bits:32,signed:true}});
 expect(classify(author.target,{...c.request,author,mode:'strict'}).status).toBe('classified');expect(classify(author.target,c.request).status).toBe('blocked');
 const wrong=u.declareCoreFacets(c.document,c.request.identity,{integerWidth:{bits:8,signed:false}});expect(classify(wrong.target,{...c.request,author:wrong}).status).toBe('blocked');
 const r=classify(c.document,c.request),forged=u.copyJson(r) as unknown as typeof r;forged.mapping.facets.integerWidth!.bits=8;expect(()=>recover(forged,forged.target!)).toThrow();
 const edited=u.copyJson(r.target) as unknown as u.Document;edited.id='edited';expect(()=>recover(r,edited)).toThrow();
},30000);
test('shape conflicts, archive changes, invalid profiles and unsafe inputs refuse',()=>{
 const c=sample();expect(()=>classify(c.document,{...c.request,nativeSource:'"long"'})).toThrow();expect(()=>classify(c.document,{...c.request,profile:'invented'} as never)).toThrow();
 const changed=u.copyJson(c.document) as unknown as u.Document;changed.modules.at(-1)!.elements[0]!.cardinality='unspecified';expect(classify(changed,c.request).status).toBe('blocked');
 expect(run('"int"','string').status).toBe('blocked');expect(run('["int","int"]').residuals.length).toBeGreaterThan(0);
 let calls=0;expect(()=>classify({get umf(){calls++;return '0.5.0';}} as never,c.request)).toThrow();expect(calls).toBe(0);
},30000);
test('closed operation and extension schemas constrain real classification output',()=>{
 const r=run(),registry=new u.Registry().register(avroFacetsPackage);expect(u.validateDocument(r.target!,registry).valid).toBe(true);
 const target=u.copyJson(r.target) as unknown as u.Document;(target.modules.at(-1)!.elements[0]!.extensions[AVRO_FACETS_EXTENSION] as any).profile='invented';expect(u.validateDocument(target,registry).valid).toBe(false);
});
test('unannotated precision metadata stays unknown and authored losses point back to the ideal',()=>{
 const unknown=run('{"type":"bytes","precision":3,"scale":2}','binary');
 expect(unknown.mapping.facets).toEqual({});expect(unknown.residuals.map(r=>r.location.path)).toEqual(['/precision','/scale']);
 expect(run('{"type":"bytes","precision":3}','binary',{mode:'strict'}).status).toBe('blocked');
 const c=sample('"string"','string'),author=u.declareCoreFacets(c.document,c.request.identity,{length:{max:3,unit:'unicode-scalar'}});
 const r=classify(author.target,{...c.request,author});expect(r.residuals.some(residual=>residual.path===r.mapping.idealPath+'/length')).toBe(true);
 expect(r.target!.modules.at(-1)!.elements[0]!.facets).toEqual(author.target.modules.at(-1)!.elements[0]!.facets);
});

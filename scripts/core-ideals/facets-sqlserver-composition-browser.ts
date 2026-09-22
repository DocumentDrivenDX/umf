import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import * as u from '../../src';
import {facetsSqlServerProjectionCases} from './facets-sqlserver-projection-cases';
const proof=await Bun.file('fixtures/validation/facets-sqlserver-projection-native.json').json(),composition=await Bun.file('fixtures/validation/facets-sqlserver-composition.json').json();
for(const evidence of [proof,composition])for(const [path,hash] of Object.entries(evidence.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),hash);
const associationProof=await Bun.file('fixtures/validation/facets-sqlserver-association-native.json').json();
for(const [path,hash] of Object.entries(associationProof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),hash);
const capture=JSON.parse(proof.sourceText);
function sourceFor(nativeSource:string,columnTable:string,columnName?:string){
 let source=u.importSqlServerCatalog(nativeSource,{id:'sqlserver-composition-browser'});source=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(source).target).target).target).target;
 const column=u.getSqlServerColumnMetadata(source).find(c=>c.table.name===columnTable&&(columnName===undefined||c.element.name===columnName))!;
 source.modules.push({id:'logical',namespace:'',elements:[{id:'value',kind:'field',name:'value',cardinality:'one',...(column.element.scalarType?{scalarType:column.element.scalarType}:{}),extensions:{}}]});
 return {source,request:{column:column.path,nativeSource,identity:{module:'logical',element:'value'},mode:'report' as const,profile:'stored-value' as const,obligation:'value-domain' as const}};
}
const rows=facetsSqlServerProjectionCases().filter(c=>proof.cases.find((p:any)=>p.request.tableName===c.request.tableName).status==='projected').map(c=>{
 const nativeSource=JSON.stringify({...capture,tables:[capture.tables.find((t:any)=>t.name===c.request.tableName)]},null,2)+'\n',s=sourceFor(nativeSource,c.request.tableName);
 return {...c,...s,projectionRequest:c.request,request:{...s.request,obligation:c.request.obligation},expected:composition.results.find((r:any)=>r.table===c.request.tableName)};
});
const control=rows.find(r=>r.name==='smallint-8-true'&&r.projectionRequest.mode==='report'&&r.projectionRequest.encoding==='checked')!,full=sourceFor(proof.sourceText,control.projectionRequest.tableName);
const associationCases=JSON.parse(associationProof.sourceText).tables.flatMap((t:any)=>t.columns.flatMap((column:any)=>['stored-value','ordinary-checked-write'].map(profile=>{
 const c=sourceFor(associationProof.sourceText,t.name,column.name);return {...c,request:{...c.request,profile},narrowed:column.column_id===1&&(['ranged','escaped'].includes(t.name)||t.name==='untrusted'&&profile==='ordinary-checked-write')};
})));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){return new URL(request.url).pathname==='/umf.js'?new Response(Bun.file('dist/umf.js'),{headers:{'content-type':'text/javascript'}}):new Response('<!doctype html><title>SQL Server facet composition</title>',{headers:{'content-type':'text/html'}});}});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});const page=await browser.newPage(),externalRequests:string[]=[];
 await page.route('**/*',route=>{if(!route.request().url().startsWith(`http://127.0.0.1:${server.port}/`)){externalRequests.push(route.request().url());return route.abort();}return route.continue();});await page.goto(`http://127.0.0.1:${server.port}/`);
 const checks=await page.evaluate(async(input:any)=>{
  const path='/umf.js',m=await import(path);let nativeRecoveries=0,idealRecoveries=0,exactFacetRecoveries=0,explicitResiduals=0,fullCatalogNativeRecoveries=0,associationRecoveries=0,narrowedAssociations=0;
  for(const c of input.rows){const p=m.projectFacetsToSqlServer(c.author,c.projectionRequest),r=m.classifySqlServerFacets(c.source,c.request);if(p.status!=='projected'||r.status!=='classified')throw Error('Composition refused');if(JSON.stringify(r.mapping.facets)!==JSON.stringify(c.expected.classified))throw Error('Classification parity');
   const authored=c.author.operation==='declare-core-facets'?c.author.request:{},same=Object.entries(authored).every(([k,v])=>JSON.stringify(v)===JSON.stringify(r.mapping.facets[k]));
   if(same)exactFacetRecoveries++;else{if(!p.residuals.length&&!r.residuals.length)throw Error('Unreported difference');explicitResiduals++;}
   for(const format of ['json','yaml']){const receipt=m.readJsonValue(m.writeJsonValue(r,format),format);if(m.recoverSqlServerFacetSource(receipt,receipt.target)!==c.request.nativeSource)throw Error('Native recovery');nativeRecoveries++;const ideal=m.readJsonValue(m.writeJsonValue(p,format),format);if(JSON.stringify(m.recoverFacetsFromSqlServer(ideal,ideal.nativeSql))!==JSON.stringify(c.author.target))throw Error('Ideal recovery');idealRecoveries++;}
  }
  const full=m.classifySqlServerFacets(input.full.source,{...input.full.request,mode:'strict'});if(full.status!=='classified')throw Error('Full catalog refused');
  for(const format of ['json','yaml']){const r=m.readJsonValue(m.writeJsonValue(full,format),format);if(m.recoverSqlServerFacetSource(r,r.target)!==input.full.request.nativeSource)throw Error('Full catalog recovery');fullCatalogNativeRecoveries++;}
  for(const c of input.associationCases){const r=m.classifySqlServerFacets(c.source,c.request);if(r.status!=='classified')throw Error('Association classification refused');const narrowed=r.mapping.facets.integerWidth?.bits===8&&r.mapping.facets.integerWidth?.signed===false;if(narrowed!==c.narrowed)throw Error('Cross-column or enforcement scope falsely narrowed');if(narrowed)narrowedAssociations++;if(m.recoverSqlServerFacetSource(r,r.target)!==c.request.nativeSource)throw Error('Association native recovery');associationRecoveries++;}
  if('Bun'in globalThis||'process'in globalThis)throw Error('Host globals');return {cases:input.rows.length,nativeRecoveries,idealRecoveries,exactFacetRecoveries,explicitResiduals,fullCatalogNativeRecoveries,associationRecoveries,narrowedAssociations};
 },{rows,full,associationCases} as any);
 assert.deepEqual(checks,{cases:145,nativeRecoveries:290,idealRecoveries:290,exactFacetRecoveries:57,explicitResiduals:88,fullCatalogNativeRecoveries:2,associationRecoveries:24,narrowedAssociations:5});assert.deepEqual(externalRequests,[]);
 const paths=['scripts/core-ideals/facets-sqlserver-composition-browser.ts','scripts/core-ideals/facets-sqlserver-projection-cases.ts','src/core-ideals/facets-sqlserver.ts','src/core-ideals/facets-sqlserver-projection.ts','src/adapters/sqlserver/facet-constraints.ts','fixtures/validation/facets-sqlserver-association-native.json','fixtures/validation/facets-sqlserver-composition.json','fixtures/validation/facets-sqlserver-projection-native.json','dist/umf.js'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-sqlserver-composition-browser.json',JSON.stringify({scope:'Composed SQL Server authored projection and native-table classification in Chromium; retained author recovery is distinct from inferred native facets and equivalence',browser:browser.version(),checks,externalRequests,sha256},null,2)+'\n');console.log(JSON.stringify(checks));
}finally{await browser?.close();server.stop(true);}

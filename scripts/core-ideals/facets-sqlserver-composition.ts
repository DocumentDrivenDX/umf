/** Compose emitted SQL with independently captured catalog tables, preserving
 * native inference separately from retained author intent. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as u from '../../src';
import {facetsSqlServerProjectionCases} from './facets-sqlserver-projection-cases';
const proof=await Bun.file('fixtures/validation/facets-sqlserver-projection-native.json').json();
for(const [path,sha] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),sha,'Stale native projection '+path);
assert.equal(proof.serverVersion,'16.0.4295.3');const capture=JSON.parse(proof.sourceText),results=[];
let idealRecoveries=0,nativeRecoveries=0,exactFacetRecoveries=0,explicitResiduals=0;
for(const [index,row] of facetsSqlServerProjectionCases().entries()){
 if(index%40===0)console.log(JSON.stringify({case:index}));
 const projection=u.projectFacetsToSqlServer(row.author,row.request),native=proof.cases[index];assert.equal(projection.status,native.status);if(projection.status==='blocked')continue;assert.equal(projection.nativeSql,native.nativeSql);
 const table=capture.tables.find((t:any)=>t.name===row.request.tableName&&t.schema===row.request.namespace);assert.ok(table);
 // Explicit single-table view: retain every property of the selected native table.
 // Full aggregate catalog recovery is qualified separately by the native oracle.
 const nativeSource=JSON.stringify({...capture,tables:[table]},null,2)+'\n';
 let source=u.importSqlServerCatalog(nativeSource,{id:'sqlserver-facet-composition'});
 source=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(source).target).target).target).target;
 const column=u.getSqlServerColumnMetadata(source)[0]!,identity={module:'logical',element:'value'};
 source.modules.push({id:'logical',namespace:'',elements:[{id:'value',kind:'field',name:column.element.name!,cardinality:'one',...(column.element.scalarType?{scalarType:column.element.scalarType}:{}),extensions:{}}]});
 const classification=u.classifySqlServerFacets(source,{column:column.path,nativeSource,identity,mode:'report',profile:'stored-value',obligation:row.request.obligation});assert.equal(classification.status,'classified');assert.ok(classification.target);
 assert.equal(u.recoverSqlServerFacetSource(classification,classification.target),nativeSource);nativeRecoveries++;
 assert.deepEqual(u.recoverFacetsFromSqlServer(projection,projection.nativeSql!),projection.source);idealRecoveries++;
 const authored=row.author.operation==='declare-core-facets'?row.author.request:{};
 const same=Object.entries(authored).every(([k,v])=>JSON.stringify((classification.mapping.facets as Record<string,unknown>)[k])===JSON.stringify(v));
 const nativeRefinements=Object.fromEntries(Object.entries(classification.mapping.facets).filter(([k])=>!Object.hasOwn(authored,k))),residuals=[...projection.residuals,...classification.residuals];
 if(same)exactFacetRecoveries++;else{assert.ok(residuals.length,'Unreported facet difference: '+row.name+'/'+row.request.encoding);explicitResiduals++;}
 results.push({name:row.name,table:row.request.tableName,encoding:row.request.encoding,mode:row.request.mode,obligation:row.request.obligation,authored,emitted:projection.mapping.facets,classified:classification.mapping.facets,recoversAuthoredFacets:same,nativeRefinements,residuals:residuals.map(r=>({reason:r.reason,outcome:r.outcome}))});
}
assert.equal(results.length,proof.projected);
// Also exercise the original aggregate capture, not only table views.
let full=u.importSqlServerCatalog(proof.sourceText,{id:'sqlserver-full-composition'});
full=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(full).target).target).target).target;
const fullRow=facetsSqlServerProjectionCases().find(r=>r.name==='smallint-8-true'&&r.request.mode==='report'&&r.request.encoding==='checked')!;
const fullColumn=u.getSqlServerColumnMetadata(full).find(c=>c.table.name===fullRow.request.tableName)!;
full.modules.push({id:'logical',namespace:'',elements:[{id:'value',kind:'field',name:'value',cardinality:'one',scalarType:'integer',extensions:{}}]});
const fullResult=u.classifySqlServerFacets(full,{column:fullColumn.path,nativeSource:proof.sourceText,identity:{module:'logical',element:'value'},mode:'strict',profile:'stored-value',obligation:'value-domain'});
assert.equal(fullResult.status,'classified');assert.deepEqual(fullResult.mapping.facets,{integerWidth:{bits:8,signed:true}});
let fullCatalogNativeRecoveries=0;
for(const format of ['json','yaml'] as const){const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(fullResult),format),format) as unknown as typeof fullResult;assert.equal(u.recoverSqlServerFacetSource(receipt,receipt.target!),proof.sourceText);fullCatalogNativeRecoveries++;}
const paths=['scripts/core-ideals/facets-sqlserver-composition.ts','scripts/core-ideals/facets-sqlserver-projection-cases.ts','src/core-ideals/facets-sqlserver.ts','src/core-ideals/facets-sqlserver-projection.ts','src/adapters/sqlserver/facet-constraints.ts','src/adapters/sqlserver/facet-predicate.ts','src/adapters/sqlserver/facet-type.ts','fixtures/validation/facets-sqlserver-projection-native.json'];
const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
const counts={cases:results.length,idealRecoveries,nativeRecoveries,exactFacetRecoveries,explicitResiduals,fullCatalogNativeRecoveries};
await Bun.write('fixtures/validation/facets-sqlserver-composition.json',JSON.stringify({scope:'SQL Server 2022 emitted DDL composed with stored-value classification of complete single-table catalog views; inference is not authorship or equivalence',serverVersion:proof.serverVersion,bindingAccepted:false,counts,results,sha256},null,2)+'\n');console.log(JSON.stringify(counts));

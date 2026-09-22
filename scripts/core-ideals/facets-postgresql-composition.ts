/** Compose authored projection with an independently captured PostgreSQL catalog. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as u from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {facetsPostgresqlProjectionCases} from './facets-postgresql-projection-cases';
const proof=await Bun.file('fixtures/validation/facets-postgresql-projection-native.json').json();
for(const [path,sha] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex'),sha,`Stale native projection: ${path}`);
assert.equal(proof.serverVersion,170004);
const nativeSource=JSON.stringify(proof.capture),supplement=JSON.stringify(proof.supplement);
let source=u.importPostgresqlCatalogCapture(nativeSource,{id:'postgresql-facet-composition'});
source=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(source).target).target).target).target;
for(const element of source.modules.find(m=>m.id==='postgresql.columns')!.elements)element.kind='field';
const columns=u.getPostgresqlColumnMetadata(source),results=[];
let idealRecoveries=0,nativeRecoveries=0,exactFacetRecoveries=0,explicitResiduals=0;
for(const [index,row] of facetsPostgresqlProjectionCases().entries()){
 if(index%24===0)console.log(JSON.stringify({case:index,total:proof.counts.cases}));
 const projection=await u.projectFacetsToPostgresql(row.author,row.request,backend);
 const native=proof.projections.find((p:any)=>p.request.tableName===row.request.tableName);
 assert.equal(projection.status,native.status);
 if(projection.status==='blocked')continue;
 assert.equal(projection.nativeSql,native.nativeSql);
 const column=columns.find(c=>c.relation.name===row.request.tableName);assert.ok(column);
 const classification=await u.classifyPostgresqlFacets(source,{column:column.path,nativeSource,supplement,mode:'report',profile:'stored-value',datumFormat:'little-endian-datum64',obligation:row.request.obligation},backend);
 assert.equal(classification.status,'classified');assert.ok(classification.target);
 const recovered=await u.recoverPostgresqlFacetSource(classification,classification.target,backend);
 assert.equal(recovered.nativeSource,nativeSource);assert.equal(recovered.supplement,supplement);nativeRecoveries++;
 assert.deepEqual(await u.recoverFacetsFromPostgresql(projection,projection.nativeSql!,backend),projection.source);idealRecoveries++;
 const authored=row.author.operation==='declare-core-facets'?row.author.request:{};
 const same=Object.entries(authored).every(([key,value])=>JSON.stringify((classification.mapping.facets as Record<string,unknown>)[key])===JSON.stringify(value));
 const nativeRefinements=Object.fromEntries(Object.entries(classification.mapping.facets).filter(([key])=>!Object.hasOwn(authored,key)));
 const residuals=[...projection.residuals,...classification.residuals];
 if(same)exactFacetRecoveries++;else{assert.ok(residuals.length,`Unreported composed facet difference: ${row.name}/${row.request.encoding}`);explicitResiduals++;}
 results.push({name:row.name,table:row.request.tableName,encoding:row.request.encoding,mode:row.request.mode,obligation:row.request.obligation,authored,emitted:projection.mapping.facets,classified:classification.mapping.facets,recoversAuthoredFacets:same,nativeRefinements,residuals:residuals.map(r=>({reason:r.reason,outcome:r.outcome}))});
}
assert.equal(results.length,proof.counts.emitted);assert.equal(idealRecoveries,results.length);assert.equal(nativeRecoveries,results.length);
const paths=['scripts/core-ideals/facets-postgresql-composition.ts','scripts/core-ideals/facets-postgresql-projection-cases.ts','src/core-ideals/facets-postgresql.ts','src/core-ideals/facets-postgresql-projection.ts','src/adapters/postgresql/facet-catalog.ts','src/adapters/postgresql/facet-resolved-predicate.ts','src/adapters/postgresql/facet-node-tree.ts','src/adapters/postgresql/facet-typmod.ts','fixtures/validation/facets-postgresql-projection-native.json'];
const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
const counts={cases:results.length,idealRecoveries,nativeRecoveries,exactFacetRecoveries,explicitResiduals};
await Bun.write('fixtures/validation/facets-postgresql-composition.json',JSON.stringify({scope:'PostgreSQL 17.4 emitted DDL composed with native stored-value classification; retained recovery is not native equivalence',serverVersion:170004,bindingAccepted:false,counts,results,sha256},null,2)+'\n');console.log(JSON.stringify(counts));

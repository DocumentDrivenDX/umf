import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as u from '../../src';
import {parquetFacetProjectionCases} from './facets-parquet-projection-cases';
import {projectFacetsToParquet,recoverFacetsFromParquet} from '../../src/core-ideals/facets-parquet-projection';
const hash=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
const native=await Bun.file('fixtures/validation/facets-parquet-projection-native.json').json();
for(const [path,sha] of Object.entries(native.sha256))assert.equal(await hash(path),sha,'Stale native evidence: '+path);
assert.equal(native.runtime,'PyArrow 21.0.0');
const targets=(await Bun.file('fixtures/validation/facets-parquet-projection-corpus.json').json()).rows,results=[];
let idealRecoveries=0,nativeRecoveries=0,exactFacetRecoveries=0,explicitResiduals=0;
for(const row of parquetFacetProjectionCases()){
 const projection=projectFacetsToParquet(row.author,row.request);if(projection.status==='blocked')continue;
 const emitted=targets.find((r:any)=>r.id===row.id);assert.ok(emitted);const bytes=u.exportParquetCapture(projection.target!);assert.deepEqual(new Uint8Array(await Bun.file(emitted.path).arrayBuffer()),bytes);
 const family=row.author.target.modules[0]!.elements[0]!.scalarType as u.ScalarType;
 const imported=u.importParquetSchema(bytes,{id:'composition'});
 const source=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(imported).target).target).target).target;
 source.modules.push({id:'logical',namespace:'',elements:[{id:'value',kind:'field',cardinality:'one',scalarType:family,extensions:{}}]});
 const classification=u.classifyParquetFacets(source,{location:{index:1,scope:'present-non-null-leaf'},identity:{module:'logical',element:'value'},mode:'report',profile:'declared-schema',obligation:row.request.obligation});assert.equal(classification.status,'classified');
 assert.deepEqual(u.exportParquetCapture(classification.target!),bytes);
 for(const format of ['json','yaml'] as const){
  const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(classification),format),format) as unknown as typeof classification;
  assert.deepEqual(u.recoverParquetFacetSource(receipt,receipt.target!),bytes);nativeRecoveries++;
  const idealReceipt=u.readJsonValue(u.writeJsonValue(u.copyJson(projection),format),format) as unknown as typeof projection;
  assert.deepEqual(recoverFacetsFromParquet(idealReceipt,bytes),row.author.target);idealRecoveries++;
 }
 const authored=row.author.operation==='declare-core-facets'?row.author.request:{};
 const same=Object.entries(authored).every(([key,value])=>JSON.stringify((classification.mapping.facets as Record<string,unknown>)[key])===JSON.stringify(value));
 const residuals=[...projection.residuals,...classification.residuals];
 if(same)exactFacetRecoveries++;else{assert.ok(residuals.length,'Unreported difference: '+row.id);explicitResiduals++;}
 results.push({id:row.id,authored,classified:classification.mapping.facets,recoversAuthoredFacets:same,nativeRefinements:Object.fromEntries(Object.entries(classification.mapping.facets).filter(([key])=>!Object.hasOwn(authored,key))),residuals:residuals.map(r=>({reason:r.reason,outcome:r.outcome}))});
}
assert.equal(results.length,native.cases);
const paths=['scripts/core-ideals/facets-parquet-composition.ts','scripts/core-ideals/facets-parquet-projection-cases.ts','fixtures/validation/facets-parquet-projection-corpus.json','src/core-ideals/facets-parquet.ts','src/core-ideals/facets-parquet-projection.ts','fixtures/validation/facets-parquet-projection-native.json'];
const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hash(p)])));
const counts={cases:results.length,idealRecoveries,nativeRecoveries,exactFacetRecoveries,explicitResiduals};
await Bun.write('fixtures/validation/facets-parquet-composition.json',JSON.stringify({scope:'Emitted Parquet scalar schema files re-imported and profile-classified; native observations do not acquire authored provenance',bindingAccepted:false,counts,results,sha256},null,2)+'\n');console.log(JSON.stringify(counts));

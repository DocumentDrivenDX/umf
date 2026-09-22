import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as u from '../../src';
import {facetsAvroProjectionCases} from './facets-avro-projection-cases';
import {avroFacetCase} from './facets-avro-cases';
import {projectFacetsToAvro,recoverFacetsFromAvro} from '../../src/core-ideals/facets-avro-projection';
const hash=async(path:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex');
const native=await Bun.file('fixtures/validation/facets-avro-projection-native.json').json();
for(const [path,sha] of Object.entries(native.sha256))assert.equal(await hash(path),sha,'Stale native evidence: '+path);
assert.deepEqual(native.versions,{apache:'1.12.0',fastavro:'1.12.2'});
const targets=await Bun.file('fixtures/validation/facets-avro-projection-targets.json').json(),results=[];
let idealRecoveries=0,nativeRecoveries=0,exactFacetRecoveries=0,explicitResiduals=0;
for(const row of facetsAvroProjectionCases()){
 const projection=projectFacetsToAvro(row.author,row.request);if(projection.status==='blocked')continue;
 const emitted=targets.find((r:any)=>r.id===row.id);assert.ok(emitted);assert.equal(emitted.schema,projection.nativeSchema);
 const family=row.author.target.modules[0]!.elements[0]!.scalarType as u.ScalarType;
 const c=avroFacetCase(projection.nativeSchema!,family,{location:{path:'/fields/0/type'},profile:row.request.profile,obligation:row.request.obligation});
 const classification=u.classifyAvroFacets(c.document,c.request);assert.equal(classification.status,'classified');
 const original=u.exportAvroBundle(c.document),classifiedNative=u.exportAvroBundle(classification.target!);assert.equal(classifiedNative.schema,original.schema);assert.deepEqual(classifiedNative.dependencies,original.dependencies);
 for(const format of ['json','yaml'] as const){
  const receipt=u.readJsonValue(u.writeJsonValue(u.copyJson(classification),format),format) as unknown as typeof classification;
  assert.deepEqual(u.recoverAvroFacetSource(receipt,receipt.target!),{schema:projection.nativeSchema,dependencies:[]});nativeRecoveries++;
  const idealReceipt=u.readJsonValue(u.writeJsonValue(u.copyJson(projection),format),format) as unknown as typeof projection;
  assert.deepEqual(recoverFacetsFromAvro(idealReceipt,idealReceipt.nativeSchema!),row.author.target);idealRecoveries++;
 }
 const authored=row.author.operation==='declare-core-facets'?row.author.request:{};
 const same=Object.entries(authored).every(([key,value])=>JSON.stringify((classification.mapping.facets as Record<string,unknown>)[key])===JSON.stringify(value));
 const residuals=[...projection.residuals,...classification.residuals];
 if(same)exactFacetRecoveries++;else{assert.ok(residuals.length,'Unreported difference: '+row.id);explicitResiduals++;}
 results.push({id:row.id,authored,classified:classification.mapping.facets,recoversAuthoredFacets:same,nativeRefinements:Object.fromEntries(Object.entries(classification.mapping.facets).filter(([key])=>!Object.hasOwn(authored,key))),residuals:residuals.map(r=>({reason:r.reason,outcome:r.outcome}))});
}
assert.equal(results.length,native.schemas);
const paths=['scripts/core-ideals/facets-avro-composition.ts','scripts/core-ideals/facets-avro-projection-cases.ts','scripts/core-ideals/facets-avro-cases.ts','src/core-ideals/facets-avro.ts','src/core-ideals/facets-avro-projection.ts','fixtures/validation/facets-avro-projection-native.json'];
const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await hash(p)])));
const counts={cases:results.length,idealRecoveries,nativeRecoveries,exactFacetRecoveries,explicitResiduals};
await Bun.write('fixtures/validation/facets-avro-composition.json',JSON.stringify({scope:'Emitted Avro scalar records re-imported and profile-classified; native observations do not acquire authored provenance',bindingAccepted:false,counts,results,sha256},null,2)+'\n');console.log(JSON.stringify(counts));

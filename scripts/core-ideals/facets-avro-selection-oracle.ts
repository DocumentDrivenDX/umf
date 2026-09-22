import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importAvroSchema,getAvroNode,readDocument,writeDocument} from '../../src';
import {parseNativeJson} from '../../src/model/native-json';
import {inspectAvroFacetSelection} from '../../src/core-ideals/avro-facet-selection';
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/facets-avro-selection-native.py'],{stdout:'inherit',stderr:'inherit'});assert.equal(await child.exited,0);
const fixture='fixtures/avro/facet-selection-cases.json',native='fixtures/validation/facets-avro-selection-native.json';
const proof=await Bun.file(native).json();assert.deepEqual(proof.versions,{apache:'1.12.0',fastavro:'1.12.2'});
for(const [p,h] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex'),h);
let resolved=0,refused=0,schemaRecoveries=0;
for(const row of (await Bun.file(fixture).json()).cases){
 const roots=[...(row.dependencies??[]).map((d:any)=>({root:parseNativeJson(d.schema),dependencyId:d.id})),{root:parseNativeJson(row.schema)}];
 if(row.selectionResolves){const result=inspectAvroFacetSelection(roots,row.location);assert.equal(result.shape,row.shape);assert.equal(result.allowsNull,row.allowsNull);assert.deepEqual(result.branches.map(b=>b.inspection.meaning?.family??null),row.families);resolved++;}
 else {assert.throws(()=>inspectAvroFacetSelection(roots,row.location));refused++;}
 const source=importAvroSchema(row.schema,{id:row.id,dependencies:row.dependencies});
 for(const format of ['json','yaml'] as const){
  const restored=readDocument(writeDocument(source,format),format);
  for(const root of roots)assert.deepEqual(getAvroNode(restored,'',root.dependencyId),root.root);
  schemaRecoveries++;
 }
}
const paths=[fixture,native,...Object.keys(proof.sha256),'scripts/core-ideals/facets-avro-selection-oracle.ts','src/core-ideals/avro-facet-selection.ts','src/core-ideals/avro-cardinality-type.ts','src/adapters/avro/facet-type.ts','src/adapters/avro/index.ts','src/adapters/avro/metadata.ts','src/model/native-json.ts','src/model/serialization.ts','src/model/json.ts','src/validation/schema.ts','spec/core/native-json.schema.json','bun.lock'];
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
const checks={resolved,refused,schemaRecoveries};assert.deepEqual(checks,{resolved:8,refused:2,schemaRecoveries:20});
await Bun.write('fixtures/validation/facets-avro-selection-oracle.json',JSON.stringify({scope:'Internal type selection with pinned native parser/sample evidence and retained schema trees; no public facet binding or original-text recovery',versions:proof.versions,checks,sha256},null,2)+'\n');console.log(JSON.stringify(checks));

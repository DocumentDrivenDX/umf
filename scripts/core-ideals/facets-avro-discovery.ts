/** Host-only native discovery and existing Avro tree retention, not facet acceptance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importAvroSchema,exportAvroSchema,getAvroNode,readDocument,writeDocument} from '../../src';
const command=['.venv/bin/python','scripts/core-ideals/facets-avro-discovery-native.py'];
const process=Bun.spawn(command,{stdout:'inherit',stderr:'inherit'});
assert.equal(await process.exited,0,'Pinned native facet discovery failed');
const path='fixtures/validation/facets-avro-discovery-native.json',proof=await Bun.file(path).json();
assert.deepEqual(proof.versions,{apache:'1.12.0',fastavro:'1.12.2'});
for(const [file,expected] of Object.entries(proof.sha256))assert.equal(createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex'),expected,`Stale native proof: ${file}`);
const fixture='fixtures/avro/facet-discovery-cases.json',rows=(await Bun.file(fixture).json()).cases;
const sources=[...new Set<string>(rows.map((r:any)=>JSON.stringify(r.schema)))];
let recoveries=0;
for(const [index,text] of sources.entries()){
 const source=importAvroSchema(text,{id:`avro-facet-discovery-${index}`});
 for(const format of ['json','yaml'] as const){
  const restored=readDocument(writeDocument(source,format),format);
  assert.deepEqual(getAvroNode(restored,''),getAvroNode(source,''));
  assert.deepEqual(JSON.parse(exportAvroSchema(restored)),JSON.parse(text));recoveries++;
 }
}
const paths=[path,...Object.keys(proof.sha256),'scripts/core-ideals/facets-avro-discovery.ts',
 'src/index.ts','src/adapters/avro/index.ts','src/adapters/avro/metadata.ts',
 'src/adapters/json-schema/tree.ts','src/model/json.ts','src/model/serialization.ts',
 'src/model/document.ts','src/model/types.ts','src/validation/document.ts',
 'src/validation/schema.ts','src/registry/registry.ts','spec/extensions/avro/package.json',
 'spec/core/schema.json','package.json','bun.lock'];
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
await Bun.write('fixtures/validation/facets-avro-discovery.json',JSON.stringify({scope:'Pinned native API discovery and JSON/YAML schema-tree retention through the existing Avro adapter; no new ideal classification, projection, browser parity or binding acceptance',versions:proof.versions,cases:rows.length,counterexampleAssertions:proof.assertions.length,schemas:sources.length,serializationRecoveries:recoveries,bindingAccepted:false,idealAdmitted:false,nativeEquivalence:false,sha256},null,2)+'\n');
console.log(JSON.stringify({schemas:sources.length,serializationRecoveries:recoveries,counterexampleAssertions:proof.assertions.length}));

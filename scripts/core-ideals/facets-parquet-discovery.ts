/** Native scalar facet discovery and byte retention, not ideal/binding acceptance. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {importParquetSchema, exportParquetCapture, getParquetFieldMetadata, readDocument, writeDocument} from '../../src';
const child=Bun.spawn(['.venv/bin/python','scripts/core-ideals/facets-parquet-discovery-native.py'],{stdout:'inherit',stderr:'inherit'});
assert.equal(await child.exited,0,'Pinned Parquet discovery failed');
const path='fixtures/validation/facets-parquet-discovery-native.json',proof=await Bun.file(path).json();
assert.equal(proof.runtime,'PyArrow 21.0.0');
const hash=async(file:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex');
for(const [file,expected] of Object.entries(proof.sha256))assert.equal(await hash(file),expected,`Stale native proof: ${file}`);
let files=0,recoveries=0;
const fields=[];
for(const row of proof.cases)for(const file of row.files){
 if(!file.accepted)continue;
 const bytes=new Uint8Array(await Bun.file(file.path).arrayBuffer());
 const source=importParquetSchema(bytes,{id:`facet-discovery-${row.id}-${file.storeSchema}`});
 const view=getParquetFieldMetadata(source);assert.equal(view.status,'checked');assert.equal(view.fields.length,1);
 const field=view.fields[0]!;assert.equal(field.repetitionLevel,0);assert.equal(field.definitionLevel,0);
 const expectedFamily=row.arrowType.startsWith('decimal')?'decimal':row.arrowType.startsWith('int')||row.arrowType.startsWith('uint')?'integer':row.arrowType==='float'||row.arrowType==='double'?'float':row.arrowType==='string'?'string':'binary';
 assert.equal(field.element.scalarType,expectedFamily,row.id);
 fields.push({id:row.id,path:file.path,storeSchema:file.storeSchema,scalarType:field.element.scalarType,nativeField:field.nativeField});
 for(const format of ['json','yaml'] as const){
  const restored=readDocument(writeDocument(source,format),format);
  assert.deepEqual(exportParquetCapture(restored),bytes,`${file.path}: ${format} native bytes`);
  assert.deepEqual(getParquetFieldMetadata(restored),view);recoveries++;
 }
 files++;
}
assert.equal(files,proof.counts.filesWritten);assert.equal(recoveries,files*2);
const paths=[path,...Object.keys(proof.sha256),'scripts/core-ideals/facets-parquet-discovery.ts','src/index.ts',
 'src/adapters/parquet/index.ts','src/adapters/parquet/field-metadata.ts','src/adapters/parquet/logical.ts',
 'src/adapters/parquet/schema.ts','src/adapters/parquet/metadata.ts','src/adapters/parquet/footer.ts',
 'src/model/serialization.ts','src/model/json.ts','src/validation/document.ts','package.json','bun.lock'];
const sha256=Object.fromEntries(await Promise.all([...new Set(paths)].sort().map(async p=>[p,await hash(p)])));
await Bun.write('fixtures/validation/facets-parquet-discovery.json',JSON.stringify({
 scope:'Pinned native facet counterexamples and existing Parquet scalar metadata/JSON/YAML byte retention; no authored facet projection, new up-classification or browser acceptance',
 runtime:proof.runtime,formatSpecificationCommit:proof.formatSpecificationCommit,counts:{...proof.counts,serializationRecoveries:recoveries},
 bindingAccepted:false,idealAdmitted:false,nativeEquivalence:false,fields,sha256},null,2)+'\n');
console.log(JSON.stringify({files,serializationRecoveries:recoveries}));

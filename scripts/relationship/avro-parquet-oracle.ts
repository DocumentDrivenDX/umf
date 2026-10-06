import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Type} from 'avsc/etc/browser/avsc-types';
import {captureParquet,exportAvroSchema,exportParquetCapture,getAvroFieldMetadata,importAvroSchema,inspectParquetSchema,readDocument,writeDocument} from '../../src';

const base='fixtures/relationship-native/';
const avscPackage=await Bun.file('node_modules/avsc/package.json').json();
assert.equal(avscPackage.version,'5.7.9');
const avroText=await Bun.file(base+'avro-value-and-id.avsc').text();
const avroNative=Type.forSchema(JSON.parse(avroText),{wrapUnions:true}) as unknown as {getName():string};
assert.equal(avroNative.getName(),'example.relationship.evidence.Order');
const avro=importAvroSchema(avroText,{id:'relationship-native-avro'});
assert.equal(exportAvroSchema(avro),avroText);
assert.deepEqual(getAvroFieldMetadata(avro).map(row=>row.element.name),['customer_value','id','customer_id']);
for(const format of ['json','yaml'] as const)assert.equal(exportAvroSchema(readDocument(writeDocument(avro,format),format)),avroText);
assert(avro.modules.every(module=>!Object.hasOwn(module,'relationships')));

const python=Bun.spawn([process.env.UMF_PYTHON_PATH??'.venv/bin/python','scripts/relationship/avro-parquet-native.py'],{stdout:'pipe',stderr:'pipe'});
const [stdout,stderr,code]=await Promise.all([new Response(python.stdout).text(),new Response(python.stderr).text(),python.exited]);
assert.equal(code,0,stderr||stdout);
const parquetNative=JSON.parse(stdout);
const bytes=new Uint8Array(await Bun.file(base+'parquet-value-and-id.parquet').arrayBuffer());
const parquet=captureParquet(bytes,{id:'relationship-native-parquet'});
const inspected=inspectParquetSchema(parquet);
assert.equal(inspected.status,'checked');
assert.deepEqual(inspected.leaves?.map(row=>row.path.join('.')),['customer_value.id','customer_id']);
for(const format of ['json','yaml'] as const)assert.deepEqual(exportParquetCapture(readDocument(writeDocument(parquet,format),format)),bytes);
assert(parquet.modules.every(module=>!Object.hasOwn(module,'relationships')));
const hashes=Object.fromEntries(await Promise.all(['avro-value-and-id.avsc','parquet-value-and-id.parquet','scripts/relationship/avro-parquet-native.py'].map(async file=>{
 const path=file.startsWith('scripts/')?file:base+file;
 return [path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')];
})));
await Bun.write(base+'avro-parquet-oracle.json',JSON.stringify({
 scope:'Native value containment and scalar ID carriers only; no authored relationship, key resolution, inverse, lifecycle or enforcement inference',
 avro:{runtime:'avsc 5.7.9',name:avroNative.getName(),fields:['customer_value','id','customer_id'],sourceRecovered:true,authoredRelationshipInferred:false},
 parquet:{...parquetNative,sourceRecovered:true,authoredRelationshipInferred:false},
 hashes,
},null,2)+'\n');
console.log({avro:avroNative.getName(),parquet:parquetNative.nativeColumns});

// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze deriveAvroFields behavior. Run from repository root with Bun.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {deriveAvroFields,type AvroFieldMetadata} from '../../../../../../src/adapters/avro/metadata';
import type {AvroPayload} from '../../../../../../src/adapters/avro';
import {parseNativeJson} from '../../../../../../src/adapters/json-schema/tree';

const out=resolve('docs/helix/04-build/evidence/rust-migration/r5-avro-fields/predecessor.json');
const hash=(data:Uint8Array|string)=>createHash('sha256').update(data).digest('hex');
const text=(value:unknown)=>JSON.stringify(value);
type Dep={id:string;schema:string};
function makePayload(source:string,dependencies:Dep[]=[]):AvroPayload {
 return {version:'1.12.0',root:parseNativeJson(source),...(dependencies.length?{dependencies:dependencies.map(d=>({id:d.id,root:parseNativeJson(d.schema)}))}:{})};
}
function observe(label:string,source:string,dependencies:Dep[]=[]){
 const payload=makePayload(source,dependencies);
 try{return {label,status:'ok',source,dependencies,payload,fields:deriveAvroFields(payload)};}
 catch(error){const e=error as Error&{code?:string;path?:string};return {label,status:'error',source,dependencies,payload,error:{name:e.name,code:e.code??null,path:e.path??null,message:e.message}};}
}

const fieldShapes=JSON.parse(await readFile('fixtures/avro/field-metadata.json','utf8'));
const numeric=JSON.parse(await readFile('fixtures/avro/integer-metadata.json','utf8'));
const temporal=JSON.parse(await readFile('fixtures/avro/temporal-metadata.json','utf8'));
const manifest=JSON.parse(await readFile('fixtures/avro/upstream/manifest.json','utf8'));
const cases:any[]=[];
cases.push(observe('26-field-shape-baseline',fieldShapes.source));
for(let i=0;i<numeric.cases.length;i++)cases.push({...observe(`numeric-${i}-${numeric.cases[i].key}-value`,numeric.cases[i].source),fixtureExpected:numeric.cases[i].expected});
for(const c of temporal.cases)cases.push(observe(`temporal-${c.id}`,c.source));
for(const f of manifest.files){
 const path='fixtures/avro/upstream/'+f.path;
 cases.push(observe('upstream-'+f.path,await readFile(path,'utf8')));
}

const adversarial:[string,string,Dep[]][]=[
 ['dependency-forward-reference',JSON.stringify({type:'record',name:'Root',namespace:'r',fields:[{name:'external',type:'shared.Token'}]}),[
  {id:'consumer',schema:JSON.stringify({type:'record',name:'Consumer',namespace:'shared',fields:[{name:'token',type:'Token'}]})},
  {id:'provider',schema:JSON.stringify({type:'fixed',name:'Token',namespace:'shared',size:8})},
 ]],
 ['dependency-provider-first',JSON.stringify({type:'record',name:'Root',namespace:'r',fields:[{name:'external',type:'shared.Token'}]}),[
  {id:'provider',schema:JSON.stringify({type:'fixed',name:'Token',namespace:'shared',size:8})},
  {id:'consumer',schema:JSON.stringify({type:'record',name:'Consumer',namespace:'shared',fields:[{name:'token',type:'Token'}]})},
 ]],
 ['duplicate-qualified-name-ambiguity',JSON.stringify({type:'record',name:'Root',fields:[{name:'x',type:'shared.Token'}]}),[
  {id:'a',schema:JSON.stringify({type:'fixed',name:'Token',namespace:'shared',size:4})},
  {id:'b',schema:JSON.stringify({type:'enum',name:'Token',namespace:'shared',symbols:['A','B']})},
 ]],
 ['namespace-shadow-and-explicit-namespace',JSON.stringify({type:'record',name:'Root',namespace:'outer',fields:[
  {name:'child',type:{type:'record',name:'Child',namespace:'inner',fields:[{name:'same',type:'int'},{name:'shadow',type:'Token'}]}},
  {name:'token',type:'Token'},
 ]}),[{id:'token',schema:JSON.stringify({type:'fixed',name:'Token',namespace:'outer',size:4})}]],
 ['recursive-record',JSON.stringify({type:'record',name:'Node',namespace:'tree',fields:[{name:'value',type:'long'},{name:'next',type:['null','Node']},{name:'child',type:{type:'record',name:'Child',fields:[{name:'parent',type:'Node'},{name:'leaf',type:'boolean'}]}}]}),[]],
 ['alias-is-not-a-declaration',JSON.stringify({type:'record',name:'Base',aliases:['Alias'],fields:[{name:'ref',type:'Alias'}]}) ,[]],
 ['null-and-mixed-unions',JSON.stringify({type:'record',name:'Unions',fields:[
  {name:'nullableInt',type:['null','int']},{name:'nullableNamed',type:['null','Fixed']},
  {name:'mixed',type:['int','string']},{name:'nullOnly',type:['null']},
  {name:'duplicateFamily',type:['int','long']},{name:'fixed',type:{type:'fixed',name:'Fixed',size:4}},
 ]}),[]],
 ['unknown-annotation-default-and-unusual-key',`{"type":"record","name":"R","fields":[{"name":"odd.name/tilde~","type":{"type":"bytes","logicalType":"future-kind","future.annotation":{"x/y~z":1}},"default":9007199254740993,"future.field":{"a/b~c":"雪"}}],"future.root":1.0000000000000000001}`,[]],
 ['exact-decimal-boundaries',`{"type":"record","name":"Decimals","fields":[{"name":"safe","type":{"type":"bytes","logicalType":"decimal","precision":9007199254740991,"scale":0}},{"name":"unsafePrecision","type":{"type":"bytes","logicalType":"decimal","precision":9007199254740992,"scale":0}},{"name":"unsafeScale","type":{"type":"bytes","logicalType":"decimal","precision":12,"scale":9007199254740992}},{"name":"negativeZero","type":{"type":"bytes","logicalType":"decimal","precision":-0,"scale":0}}]}`,[]],
 ['root-union-with-record-branches',JSON.stringify([{type:'record',name:'A',fields:[{name:'a',type:'boolean'}]},{type:'record',name:'B',fields:[{name:'b',type:'double'}]}]),[]],
];
for(const [label,source,deps] of adversarial)cases.push(observe('adversarial-'+label,source,deps));

const scalarTypes=(rows:AvroFieldMetadata[])=>rows.map(f=>f.element.scalarType??null);
const shapeResult=cases.find(c=>c.label==='26-field-shape-baseline')!;
if(JSON.stringify(scalarTypes(shapeResult.fields))!==JSON.stringify(fieldShapes.expected))throw new Error('26-field shape expectations changed');
for(let i=0;i<numeric.cases.length;i++){
 const c=cases.find(c=>c.label.startsWith(`numeric-${i}-`))!;
 if(JSON.stringify(scalarTypes(c.fields))!==JSON.stringify(numeric.cases[i].expected))throw new Error(`Numeric expectation changed at ${i}`);
}
for(const expected of temporal.cases){
 const c=cases.find(c=>c.label===`temporal-${expected.id}`)!;
 if((c.fields[0]?.element.scalarType??null)!==expected.expected)throw new Error(`Temporal expectation changed at ${expected.id}`);
}
for(const f of manifest.files){
 const caseRow=cases.find(c=>c.label==='upstream-'+f.path)!;
 if(hash(caseRow.source)!==f.sha256)throw new Error(`Pinned Avro upstream schema changed: ${f.path}`);
}

// The returned native field tree must be copied; changing it cannot alter future derivation.
const copyPayload=makePayload('{"type":"record","name":"Copy","fields":[{"name":"value","type":"int","doc":"source"}]}');
const first=deriveAvroFields(copyPayload);(first[0]!.nativeField as any).members.doc.value='mutated';
const second=deriveAvroFields(copyPayload);
const copyIsolation={mutatedReturnedCopy:first[0]!.nativeField,subsequentSourceValue:(second[0]!.nativeField as any).members.doc.value,sourceTreeValue:(copyPayload.root as any).members.fields.items[0].members.doc.value,isolated:(second[0]!.nativeField as any).members.doc.value==='source'&&(copyPayload.root as any).members.fields.items[0].members.doc.value==='source'};

const sourcePaths=[...new Set([
 'package.json','bun.lock','src/adapters/avro/metadata.ts','src/adapters/avro/index.ts','src/adapters/json-schema/tree.ts',
 'src/model/json.ts','src/model/serialization.ts','src/model/types.ts','tests/avro/metadata.test.ts','tests/avro/integer-metadata.test.ts','tests/avro/temporal-metadata.test.ts',
 'fixtures/avro/field-metadata.json','fixtures/avro/integer-metadata.json','fixtures/avro/temporal-metadata.json','fixtures/avro/upstream/manifest.json',
 'scripts/avro-metadata-oracle.py','scripts/avro-integer-metadata-oracle.py','scripts/avro-temporal-metadata-oracle.py',
 'spec/extensions/avro/schema.json','spec/extensions/avro/package.json','spec/extensions/avro/field-metadata.schema.json',
 'docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md','docs/helix/02-design/contracts/CONTRACT-007-avro.md','docs/helix/02-design/contracts/CONTRACT-008-avro-document-projection.md',
 'docs/helix/03-test/test-plan.md','docs/helix/04-build/rust-migration-plan.md',
 'docs/helix/04-build/evidence/rust-migration/r5-avro-fields/capture.ts',
 'docs/helix/04-build/evidence/rust-migration/r5-avro-fields/native-oracle.py',
 ...manifest.files.map((f:{path:string})=>'fixtures/avro/upstream/'+f.path),
])].sort();
const sources=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,hash(await readFile(p))])));
const avscFiles=[...new Bun.Glob('**/*').scanSync('node_modules/avsc')].filter(p=>!p.endsWith('/')).sort();
const avscClosure=Object.fromEntries(await Promise.all(avscFiles.map(async p=>[p,hash(await readFile('node_modules/avsc/'+p))])));
const avscPackage=JSON.parse(await readFile('node_modules/avsc/package.json','utf8'));
const pyPath='python/.venv/bin/python';
const pyVersion=spawnSync(pyPath,['--version'],{encoding:'utf8'});
const pyOracle=spawnSync(pyPath,['-c','import avro, fastavro; print(avro.__version__, fastavro.__version__)'],{encoding:'utf8'});
const report={capture:'R5 Avro deriveAvroFields TypeScript predecessor',profile:{bun:Bun.version,avsc:avscPackage.version,avscFiles:avscFiles.length,avscClosureSha256:hash(JSON.stringify(avscClosure)),upstream:{repository:manifest.repository,tag:manifest.tag,commit:manifest.commit,files:manifest.files.length,manifestSha256:hash(await readFile('fixtures/avro/upstream/manifest.json')),verifiedManifestFileHashes:manifest.files.length},python:{command:pyPath,version:(pyVersion.stdout||pyVersion.stderr).trim(),pinnedNativeOracleAttemptStatus:pyOracle.status,stdout:pyOracle.stdout,stderr:pyOracle.stderr},apacheAvroExpected:'1.12.0',fastavroExpected:'1.12.2'},sourceHashes:sources,avscClosure,counts:{shapeFields:fieldShapes.view.length,numericCases:numeric.cases.length,temporalCases:temporal.cases.length,upstreamSchemas:manifest.files.length,adversarialCases:adversarial.length,totalCapturedCases:cases.length},fixtureExpectations:{shapeScalarTypes:fieldShapes.expected,numericScalarTypes:numeric.cases.map((c:any)=>c.expected),temporalScalarTypes:temporal.cases.map((c:any)=>({id:c.id,expected:c.expected}))},copyIsolation,cases};
await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({out,reportSha256:hash(await readFile(out)),runnerSha256:sources['docs/helix/04-build/evidence/rust-migration/r5-avro-fields/capture.ts'],counts:report.counts,profile:report.profile,errors:cases.filter(c=>c.status==='error').map(c=>({label:c.label,error:c.error})),copyIsolation},null,2));

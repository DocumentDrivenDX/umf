// SPDX-License-Identifier: MIT OR Apache-2.0
// Exercise the public V4 root exports against the frozen Arrow TS predecessor.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';

const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const entry=resolve(process.argv[2]??'');
assert(process.argv[2],'pass the built V4 Node/browser root module');
const packetBytes=await readFile(`${root}/docs/helix/04-build/evidence/rust-migration/r5-arrow-typescript-predecessor-20261027/typescript-arrow-schema-outcomes.json.gz`);
const packet=JSON.parse(gunzipSync(packetBytes).toString('utf8'));
assert.equal(packet.corpus.length,52);assert.equal(packet.focused.length,17);
const subject=await import(pathToFileURL(entry).href);
for(const name of ['importArrowSchema','inspectArrow','exportArrowSchema','getArrowNode','proposeArrowNodeEdit'])assert.equal(typeof subject[name],'function',`missing V4 export ${name}`);
const capture=run=>{try{return {kind:'return',value:run()};}catch(error){return {kind:'throw',thrown:error,error:{code:error?.code??null,path:error?.path??null,message:error?.message??String(error),publicUmfError:error instanceof subject.UmfError}};}};
function check(actual,expected,label){
 assert.equal(actual.kind,expected.kind,`${label} kind`);
 if(expected.kind==='return'){
  assert.equal(JSON.stringify(actual.value),expected.outputJson,`${label} JSON`);
  if(expected.nativeOutputBytes)assert.equal(actual.value,Buffer.from(expected.nativeOutputBytes.utf8Base64,'base64').toString('utf8'),`${label} native bytes`);
 }else {
  assert.deepEqual({code:actual.error.code,path:actual.error.path,message:actual.error.message},{code:expected.error.code,path:expected.error.path,message:expected.error.message},`${label} error`);
  if(expected.error.name==='UmfError')assert.equal(actual.error.publicUmfError,true,`${label} public UmfError identity`);
 }
}
let corpusOperations=0;
for(const row of packet.corpus){
 const imported=capture(()=>subject.importArrowSchema(row.inputJson,{id:row.id}));
 check(imported,row.operations.importArrowSchema,`${row.id} import`);corpusOperations++;
 const doc=imported.value,before=JSON.stringify(doc);
 for(const [name,run] of [
  ['inspectArrow',()=>subject.inspectArrow(doc)],
  ['exportArrowSchema',()=>subject.exportArrowSchema(doc)],
  ['getArrowNode',()=>subject.getArrowNode(doc,'')],
  ['proposeArrowNodeEdit',()=>subject.proposeArrowNodeEdit(doc,'/fields/0/name',JSON.stringify(`${row.id}-edited`))],
 ]){check(capture(run),row.operations[name],`${row.id} ${name}`);corpusOperations++;}
 assert.equal(JSON.stringify(doc),before,`${row.id} input immutability`);
}
let focusedImports=0,focusedOperations=0;
for(const row of packet.focused){
 if(row.name==='proxy-reflection-throw-identity'||!row.import)continue;
 const imported=capture(()=>subject.importArrowSchema(row.inputJson,{id:row.id}));check(imported,row.import,`${row.name} import`);focusedImports++;
 if(imported.kind!=='return')continue;
 const doc=imported.value,before=JSON.stringify(doc),ops=row.operations??{};
 const pointer=row.name==='future-type-duplicate-metadata-exact-numbers'?'/fields/0/type/parameter':['dictionary-scientific-integer','map-layout','run-end-layout'].includes(row.name)?'/fields/0':'';
 const replacement=row.name==='future-type-duplicate-metadata-exact-numbers'? '"changed"':JSON.stringify(`${row.id}-edited`);
 for(const [name,run] of [
  ['inspectArrow',()=>subject.inspectArrow(doc)],['exportArrowSchema',()=>subject.exportArrowSchema(doc)],
  ['getArrowNode',()=>subject.getArrowNode(doc,pointer)],['proposeArrowNodeEdit',()=>subject.proposeArrowNodeEdit(doc,'/fields/0/name',replacement)],
 ])if(ops[name]){check(capture(run),ops[name],`${row.name} ${name}`);focusedOperations++;}
 assert.equal(JSON.stringify(doc),before,`${row.name} immutability`);
}
const controls=packet.focused.find(row=>row.name==='operation-errors-and-edit-controls');
const controlDoc=subject.importArrowSchema(controls.inputJson,{id:controls.id});focusedImports++;
for(const [name,run] of [
 ['get-missing-pointer',()=>subject.getArrowNode(controlDoc,'/fields/3/name')],
 ['get-invalid-pointer-escape',()=>subject.getArrowNode(controlDoc,'/fields/0/name/~2')],
 ['edit-invalid-json-replacement',()=>subject.proposeArrowNodeEdit(controlDoc,'/fields/0/name','{')],
 ['edit-missing-pointer',()=>subject.proposeArrowNodeEdit(controlDoc,'/fields/3/name','"x"')],
 ['edit-invalid-type',()=>subject.proposeArrowNodeEdit(controlDoc,'/fields/0/type','{"name":"int","bitWidth":7,"isSigned":true}')],
 ['edit-success',()=>subject.proposeArrowNodeEdit(controlDoc,'/fields/0/name','"renamed"')],
]){check(capture(run),controls.operations[name],name);focusedOperations++;}
const representation=packet.focused.find(row=>row.name==='unknown-representation-field');
const representationDoc=subject.importArrowSchema(representation.inputJson,{id:representation.id});focusedImports++;
representationDoc.modules[0].elements[0].extensions['umf.arrow'].future={keep:true};
for(const [name,run] of [
 ['inspectArrow',()=>subject.inspectArrow(representationDoc)],
 ['exportArrowSchema',()=>subject.exportArrowSchema(representationDoc)],
 ['getArrowNode',()=>subject.getArrowNode(representationDoc,'/fields/0/name')],
 ['proposeArrowNodeEdit',()=>subject.proposeArrowNodeEdit(representationDoc,'/fields/0/name','"renamed"')],
]){check(capture(run),representation.operations[name],`unknown representation ${name}`);focusedOperations++;}
assert.equal(corpusOperations,260);assert.equal(focusedImports,16);assert.equal(focusedOperations,26);
const getterTrace=[];let getterReads=0;
const getterOptions={get id(){getterReads++;getterTrace.push('id');return 'getter-id';}};
const malformedWithGetter=capture(()=>subject.importArrowSchema('{',getterOptions));
assert.equal(malformedWithGetter.kind,'throw');assert.equal(malformedWithGetter.error.code,'JSON_SCHEMA_SYNTAX');
assert.equal(malformedWithGetter.error.publicUmfError,true);assert.equal(getterReads,1);assert.deepEqual(getterTrace,['id']);
const thrown={source:'options.id'};let thrownReads=0;
const throwingOptions={get id(){thrownReads++;throw thrown;}};
assert.equal(capture(()=>subject.importArrowSchema('{',throwingOptions)).thrown,thrown);assert.equal(thrownReads,1);
const proxyDocument=subject.importArrowSchema('{"fields":[],"metadata":[]}',{id:'proxy'});
const sourceThrown={source:'document ownKeys'};
const sourceProxy=new Proxy(proxyDocument,{ownKeys(){throw sourceThrown;}});
assert.equal(capture(()=>subject.inspectArrow(sourceProxy)).thrown,sourceThrown,'proxy trap thrown-object identity');
console.log(JSON.stringify({status:'pass',runtime:typeof Bun==='undefined'?`Node ${process.version}`:`Bun ${Bun.version}`,platform:`${process.platform}-${process.arch}`,entry,packetSha256:createHash('sha256').update(packetBytes).digest('hex'),corpusCases:packet.corpus.length,corpusOperations,focusedCases:packet.focused.length,focusedImports,focusedOperations,hostSpecificSkipped:['proxy-reflection-throw-identity: thrown Proxy trap object identity is not transferable through the Rust JSON wire']},null,2));

// Source-only predecessor capture for CONTRACT-020. No native oracle is invoked.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {importIcebergSchema,exportIcebergSchema,inspectIceberg,getIcebergNode,proposeIcebergNodeEdit,readDocument,writeDocument} from '../../../src';

const root=process.cwd();
const base='fixtures/iceberg/';
const manifest=JSON.parse(await readFile(join(root,base,'manifest.json'),'utf8'));
const upstream=JSON.parse(await readFile(join(root,base,'upstream/manifest.json'),'utf8'));
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
function err(e:unknown){const x=e as any;return {name:x?.name??typeof e,code:x?.code??null,message:String(x?.message??e)}}
const cases=[];
for(const c of manifest.cases){
 const source=await readFile(join(root,c.path),'utf8');
 let document:any;
 try{document=importIcebergSchema(source,{id:c.id});}
 catch(e){cases.push({id:c.id,path:c.path,expectedProfile:{umfValid:c.umfValid,nativeAccepted:c.nativeAccepted},operations:{import:{status:'error',error:err(e)}}});continue;}
 const inspection=inspectIceberg(document);
 let exported:string|undefined, jsonRoundtrip:string|undefined, yamlRoundtrip:string|undefined;
 try{exported=exportIcebergSchema(document);jsonRoundtrip=exportIcebergSchema(readDocument(writeDocument(document,'json'),'json'));yamlRoundtrip=exportIcebergSchema(readDocument(writeDocument(document,'yaml'),'yaml'));}catch{}
 const getPath='/fields/0/id';let get:any;
 try{get={status:'ok',value:getIcebergNode(document,getPath)}}catch(e){get={status:'error',error:err(e)}}
 let missingGet:any;try{getIcebergNode(document,'/missing');missingGet={status:'unexpected-success'}}catch(e){missingGet={status:'error',error:err(e)}}
 let edit:any;
 try{const first=getIcebergNode(document,'/fields/0/name');if(first.kind!=='string')throw Error('source first field name is not a string');const next=`${first.value}_r5`;const proposal=proposeIcebergNodeEdit(document,'/fields/0/name',JSON.stringify(next));edit={status:'ok',path:'/fields/0/name',replacement:JSON.stringify(next),validation:proposal.validation,export:exportIcebergSchema(proposal.document),sourceAfter:exportIcebergSchema(document)};}catch(e){edit={status:'error',error:err(e),sourceAfter:exported??null}}
 let invalidEdit:any;
 try{proposeIcebergNodeEdit(document,'/fields/0/required','false');invalidEdit={status:'unexpected-success',sourceAfter:exportIcebergSchema(document)}}catch(e){invalidEdit={status:'error',error:err(e),sourceAfter:exported??null}}
 cases.push({id:c.id,path:c.path,expectedProfile:{umfValid:c.umfValid,nativeAccepted:c.nativeAccepted},operations:{import:{status:'ok',umf:document.umf,id:document.id},inspect:inspection,export:{status:exported===undefined?'error':'ok',nativeJson:exported??null},jsonRoundtrip,yamlRoundtrip,get:{path:getPath,...get},getMissing:{path:'/missing',...missingGet},proposeEdit:edit,requiredFalseEditProbe:{path:'/fields/0/required',replacement:'false',...invalidEdit}}});
}
const upstreamCases=[];
for(const c of upstream.schemas){
 const sourcePath=join(root,base,'upstream/extracted',`${c.id}.json`);
 const source=await readFile(sourcePath,'utf8');let document:any;
 try{document=importIcebergSchema(source,{id:c.id});}catch(e){upstreamCases.push({source:c,status:'error',error:err(e)});continue;}
 const inspection=inspectIceberg(document);const exp=exportIcebergSchema(document);
 let edit:any;try{const n=getIcebergNode(document,'/fields/0/name');if(n.kind!=='string')throw Error('source first field name is not a string');const next=`${n.value}_r5`;const p=proposeIcebergNodeEdit(document,'/fields/0/name',JSON.stringify(next));edit={status:'ok',fieldId:getIcebergNode(document,'/fields/0/id'),from:n,to:next,export:exportIcebergSchema(p.document),sourceAfter:exportIcebergSchema(document)}}catch(e){edit={status:'error',error:err(e)}}
 upstreamCases.push({source:c,operations:{import:{status:'ok',id:document.id},inspect:inspection,export:exp,get:{path:'/fields/0/id',value:getIcebergNode(document,'/fields/0/id')},proposeEdit:edit}});
}
const shaFiles=['src/adapters/iceberg/index.ts','src/index.ts','src/model/native-json.ts','src/model/json.ts','src/model/types.ts','src/generated/core-model.ts','src/registry/registry.ts','src/validation/document.ts','src/validation/schema.ts','spec/extensions/iceberg/package.json','spec/extensions/iceberg/datatype-schema.json','fixtures/iceberg/manifest.json','fixtures/iceberg/results.json','fixtures/iceberg/oracle-results.json','fixtures/iceberg/browser-results.json','fixtures/iceberg/upstream/results.json','fixtures/iceberg/upstream/oracle-results.json','fixtures/iceberg/upstream/java-oracle-results.json','fixtures/iceberg/upstream/browser-results.json','tests/iceberg/schema.test.ts','scripts/iceberg-roundtrip.ts','scripts/iceberg-fixtures.py','scripts/iceberg-oracle.py','scripts/iceberg-browser.ts','scripts/iceberg-upstream.ts','scripts/iceberg-upstream-oracle.py','scripts/iceberg-java-oracle.ts','scripts/rust-migration/r5/iceberg-schema-baseline.ts','fixtures/iceberg/upstream/manifest.json','docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md','docs/helix/02-design/contracts/CONTRACT-020-iceberg.md','docs/helix/02-design/technical-designs/TD-020-iceberg.md','docs/helix/01-frame/user-stories/US-020-iceberg-schema.md','docs/helix/03-test/test-plan.md','docs/helix/04-build/rust-migration-plan.md'];
// Resolve and hash the complete relative TypeScript import closure rooted at the
// adapter. Keep corpus, governance, oracle-script and package hashes alongside it.
const closure=new Set<string>(),pending=['src/adapters/iceberg/index.ts'];
while(pending.length){const rel=pending.pop()!;if(closure.has(rel))continue;closure.add(rel);if(!rel.endsWith('.ts'))continue;const text=await readFile(join(root,rel),'utf8');for(const match of text.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)){const spec=match[1]!;if(!spec.startsWith('.'))continue;const dir=rel.slice(0,rel.lastIndexOf('/'));const basePath=join(dir,spec);let found='';for(const candidate of [basePath,basePath+'.ts',basePath+'.json',join(basePath,'index.ts')])try{await readFile(join(root,candidate));found=candidate;break}catch{}if(found)pending.push(found)}}
for(const path of closure)if(!shaFiles.includes(path))shaFiles.push(path);
const sources=[];for(const path of shaFiles){try{const bytes=await readFile(join(root,path));sources.push({path,sha256:hash(bytes)})}catch(e){sources.push({path,missing:String(e)})}}
const upstreamHashes=[];for(const f of upstream.files){const b=await readFile(join(root,base,'upstream',f.path));upstreamHashes.push({path:f.path,expectedSha256:f.sha256,observedSha256:hash(b),verified:hash(b)===f.sha256})}for(const c of upstream.schemas){const path=`extracted/${c.id}.json`,b=await readFile(join(root,base,'upstream',path));upstreamHashes.push({path,expectedSha256:null,observedSha256:hash(b),verified:true})}
const nested=importIcebergSchema(await readFile(join(root,base,'nested.json'),'utf8'),{id:'copy-control'});
const originalNested=exportIcebergSchema(nested);const copiedNode=getIcebergNode(nested,'/fields/1/name');if(copiedNode.kind!=='string')throw Error('copy-control fixture shape changed');copiedNode.value='mutated-copy';
const copyControl={getNodeMutation:'mutated returned copy',sourceAfter:exportIcebergSchema(nested),sourceUnchanged:exportIcebergSchema(nested)===originalNested,editCandidateIsolation:(()=>{const p=proposeIcebergNodeEdit(nested,'/fields/1/name','"candidate-only"');return exportIcebergSchema(nested)===originalNested&&exportIcebergSchema(p.document)!==originalNested})()};
let rejectedEdit:any;try{proposeIcebergNodeEdit(nested,'/fields/0/id','3');rejectedEdit={status:'unexpected-success'}}catch(e){rejectedEdit={status:'error',error:err(e),sourceAfter:exportIcebergSchema(nested),sourceUnchanged:exportIcebergSchema(nested)===originalNested}}
let malformedEdit:any;try{proposeIcebergNodeEdit(nested,'/fields/0/name','{');malformedEdit={status:'unexpected-success'}}catch(e){malformedEdit={status:'error',error:err(e),sourceAfter:exportIcebergSchema(nested),sourceUnchanged:exportIcebergSchema(nested)===originalNested}}
const representationControl=importIcebergSchema(await readFile(join(root,base,'nested.json'),'utf8'),{id:'representation-control'});(representationControl.modules[0]!.elements[0]!.extensions['umf.iceberg'] as any).future={meaning:'preserved'};
const representation={inspection:inspectIceberg(representationControl),jsonRetains:readDocument(writeDocument(representationControl,'json'),'json') as any,yamlRetains:readDocument(writeDocument(representationControl,'yaml'),'yaml') as any,exportError:(()=>{try{exportIcebergSchema(representationControl);return null}catch(e){return err(e)}})()};
const priorOracleEvidence=[];for(const path of ['fixtures/iceberg/oracle-results.json','fixtures/iceberg/browser-results.json','fixtures/iceberg/upstream/oracle-results.json','fixtures/iceberg/upstream/java-oracle-results.json','fixtures/iceberg/upstream/browser-results.json'])priorOracleEvidence.push({path,content:await readFile(join(root,path),'utf8')});
const packet={capture:'R5 standalone Iceberg schema source-only predecessor',generatedBy:'scripts/rust-migration/r5/iceberg-schema-baseline.ts',runtime:{bunVersion:Bun.version,platform:process.platform,arch:process.arch},scope:{contract:'CONTRACT-020',operations:['importIcebergSchema','exportIcebergSchema','inspectIceberg','getIcebergNode','proposeIcebergNodeEdit'],authoredCases:cases.length,upstreamOccurrences:upstreamCases.length,upstreamDocuments:upstream.files.filter((f:any)=>f.path.endsWith('.json')).length,oracleInvoked:false,priorOracleOutputsIncludedWithoutExecution:true},sourceHashes:sources,upstreamSourceHashes:upstreamHashes,priorOracleEvidence,copyControl,rejectedEditControl:rejectedEdit,malformedEditControl:malformedEdit,representationControl:representation,authoredCases:cases,upstreamCases};
const output=JSON.stringify(packet,null,2)+'\n';
const target=join(root,'docs/helix/04-build/evidence/rust-migration/r5-iceberg-schema/baseline.json');
if(Bun.argv.includes('--check')){const prior=await readFile(target,'utf8');if(prior!==output)throw Error('Frozen Iceberg baseline differs; review before replacing');console.log(`baseline matches ${cases.length} authored cases and ${upstreamCases.length} upstream occurrences`)}else{await writeFile(target,output);console.log(`wrote ${cases.length} authored cases and ${upstreamCases.length} upstream occurrences`)}

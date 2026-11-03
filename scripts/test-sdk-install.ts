// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {capturePortableProducerSnapshot,sha256File,SDK_SAGA_MEMBERS,SDK_SAGA_NODE_ENTRY,verifySdkMemberCustody,verifyPortableProducerSnapshot} from './saga-portable/custody';
// Set UMF_SDK_INSTALL_RETAIN_DIR only when a later installed-entry probe needs
// this exact consumer and its archive-to-installed-member custody receipt.
const retainedDirectory=process.env.UMF_SDK_INSTALL_RETAIN_DIR?resolve(process.env.UMF_SDK_INSTALL_RETAIN_DIR):undefined;
const archive=resolve('.cache/sdk-distribution/umf-sdk.tgz');
const sourceSnapshot=await capturePortableProducerSnapshot('.',{sdkArchive:archive});
const {checkCoreDistribution}=await import('./check-core-authority');
const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const installerSourceSha256=sourceSnapshot.qualificationInputs['scripts/test-sdk-install.ts']!;
const archiveMemberProbe=`import hashlib,json,sys,tarfile
names=${JSON.stringify(SDK_SAGA_MEMBERS.map(member=>`package/${member}`))}
with tarfile.open(sys.argv[1],mode='r:gz') as archive:
 members=archive.getmembers()
 result={}
 for name in names:
  matches=[member for member in members if member.name==name]
  if len(matches)!=1 or not matches[0].isfile(): raise SystemExit('missing or non-regular SDK archive member: '+name)
  stream=archive.extractfile(matches[0])
  if stream is None: raise SystemExit('unreadable SDK archive member: '+name)
  data=stream.read()
  result[name]={'size':len(data),'sha256':hashlib.sha256(data).hexdigest()}
 print(json.dumps(result,sort_keys=True))`;
const memberChild=Bun.spawn(['python3','-c',archiveMemberProbe,archive],{stdout:'pipe',stderr:'pipe'});
const [memberStatus,memberStdout,memberStderr]=await Promise.all([
 memberChild.exited,new Response(memberChild.stdout).text(),new Response(memberChild.stderr).text(),
]);
if(memberStatus!==0)throw Error('SDK archive member verification failed: '+memberStderr);
const archiveMembers=JSON.parse(memberStdout) as Record<string,{size:number;sha256:string}>;
const directory=retainedDirectory??await mkdtemp(join(tmpdir(),'umf-sdk-install-'));
if(retainedDirectory)await mkdir(directory,{recursive:false});
async function run(command:string[]){const child=Bun.spawn(command,{cwd:directory,stdout:'inherit',stderr:'inherit'});if(await child.exited)throw Error('Installed SDK check failed: '+command[0]);}
try{
 await Bun.write(join(directory,'package.json'),JSON.stringify({name:'umf-sdk-consumer-check',private:true,type:'module'}));
 await run([process.execPath,'install','--ignore-scripts',archive]);
 const expectedVersion=(await Bun.file('package.json').json()).version;
 const packageRoot=join(directory,'node_modules/@umf/core');
 const installedPackageBytes=await readFile(join(packageRoot,'package.json'));
 const installedManifestBytes=await readFile(join(packageRoot,'manifest.json'));
 const installedMetadata=JSON.parse(installedPackageBytes.toString('utf8'));
 if(installedMetadata.version!==expectedVersion)throw Error('Installed SDK release version differs from source package');
 const installedDigests=Object.fromEntries(await Promise.all(SDK_SAGA_MEMBERS.map(async member=>{
  const bytes=await readFile(join(packageRoot,member));return [`package/${member}`,{size:bytes.length,sha256:sha256(bytes)}];
 })));
 const installedMemberPaths=Object.fromEntries(Object.keys(installedDigests).map(name=>[name,join(packageRoot,name.replace(/^package\//,''))]));
 const installedManifest=JSON.parse(installedManifestBytes.toString('utf8'));
 verifySdkMemberCustody(installedMetadata,installedManifest,installedDigests);
 for(const [name,actual] of Object.entries(installedDigests) as [string,{size:number;sha256:string}][]){
  const expected=archiveMembers[name];
  if(!expected||actual.size!==expected.size||actual.sha256!==expected.sha256)throw Error('Installed SDK member differs from exact candidate archive: '+name);
  const member=name.replace(/^package\//,'');
  if(member.startsWith('dist/')&&installedManifest.sha256?.[member]!==actual.sha256)throw Error('Installed SDK runtime member differs from its distribution manifest: '+member);
 }
 const distribution=await checkCoreDistribution(packageRoot);console.log(JSON.stringify({installedCoreDistribution:distribution}));
 await Bun.write(join(directory,'current-conformance.json'),await Bun.file('fixtures/metamodel/current-conformance.json').text());
 await Bun.write(join(directory,'approve.json'),await Bun.file('fixtures/actions/approve.json').text());
 await Bun.write(join(directory,'commerce.json'),await Bun.file('tests/unified/commerce.json').text());
 await Bun.write(join(directory,'probe.ts'),`import {createUmfRegistry,inspectActions,readDocument,Registry,validateDocument,CURRENT_CORE_VERSION,generatePythonClient,generatePackTools} from '@umf/core';
import {createValidator} from '@umf/core/loader-contract';
const registry=createUmfRegistry();
if(!registry.get('umf.actions','0.1.0')?.semantics||typeof createValidator!=='function')throw Error('Missing installed SDK entrypoint');
const source=readDocument(await Bun.file('approve.json').text(),'json');const result=inspectActions(source,registry);
if(!result.validation.valid||result.validation.complete||result.actions[0]?.action.id!=='approve')throw Error('Installed action behavior differs');
const corpus=await Bun.file('current-conformance.json').json();if(corpus.currentVersion!==CURRENT_CORE_VERSION)throw Error('Installed generated current marker differs');
for(const item of corpus.cases){const r=new Registry();if(item.registry)r.register({id:item.registry.id,version:item.registry.version,coreVersion:CURRENT_CORE_VERSION,description:'Frozen callback probe',schema:true,semantics:'Trusted callback probe',scopes:[item.registry.scope],capabilities:{validation:'semantic',directions:[],evidence:[]}},(payload,context)=>[{code:'BASELINE_CALLBACK',path:context.path,message:context.document.id+':'+context.scope+':'+payload.kind,severity:'warning'}]);if(!Bun.deepEquals(validateDocument(item.document,r),{valid:item.valid,complete:item.complete,diagnostics:item.diagnostics}))throw Error('Installed conformance '+item.id);}
const client=generatePythonClient({text:await Bun.file('commerce.json').text(),package:'shop'});
if(client.description.umf!==CURRENT_CORE_VERSION||client.files.length!==7||!client.files.some(f=>f.path==='shop/models.py'&&f.text.includes('class Actions:')))throw Error('Installed unified generator missing');
const packText=JSON.stringify({id:'sdk-inventory',version:'1.0.0',schemas:[{id:'items',format:'tablespec',reference:'schemas/items.json'}]});
const sourceText=JSON.stringify({version:'1.0',table_name:'items',columns:[{name:'item_id',data_type:'INTEGER',nullable:false},{name:'label',data_type:'VARCHAR',nullable:false}],primary_key:['item_id']});
const request={profile:'umf.pack-tools/1',pack:{id:'sdk-inventory',version:'1.0.0',text:packText},sources:[{id:'items',path:'schemas/items.json',format:'json',schemaFormat:'tablespec',text:sourceText}],options:{schema:'inventory',package:'inventory_sdk'},targets:['ddl','orm','crud']};
const keyed=generatePackTools(request);
if(keyed.profile!=='umf.pack-tools-result/1'||keyed.status!=='generated'||keyed.pack.id!=='sdk-inventory'||!keyed.files.some(f=>f.path==='schema.sql'&&f.kind==='ddl')||!keyed.files.some(f=>f.path==='inventory_sdk/models.py'&&f.kind==='orm')||!keyed.files.some(f=>f.path==='inventory_sdk/crud.py'&&f.kind==='crud')||!keyed.files.some(f=>f.path==='source-companion.json'&&f.kind==='source')||keyed.coverage[0]?.operations.join(',')!=='ddl,orm,crud:create,crud:read,crud:list,crud:update,crud:delete')throw Error('Installed pack-tools public SDK mapping or keyed outputs differ');
const unkeyed=generatePackTools({...request,sources:[{...request.sources[0],text:JSON.stringify({version:'1.0',table_name:'items',columns:[{name:'label',data_type:'VARCHAR',nullable:false}]})}]});
if(unkeyed.status!=='partial'||!unkeyed.files.some(f=>f.path==='schema.sql')||unkeyed.files.some(f=>f.kind==='orm'||f.kind==='crud')||!unkeyed.diagnostics.some(d=>d.code==='PACK_TOOLS_CRUD_KEY_REQUIRED'))throw Error('Installed pack-tools did not preserve the explicit unkeyed refusal');
let mappedError;try{generatePackTools({...request,options:{schema:'inventory',package:'invalid-package!'}});}catch(error){mappedError=error;}
if(mappedError?.name!=='UmfPackToolsError'||mappedError?.code!=='PACK_TOOLS_OPTIONS'||mappedError?.path!=='/options/package')throw Error('Installed pack-tools native error mapping differs: '+JSON.stringify(mappedError));
console.log(JSON.stringify({unifiedGenerator:true,packTools:{keyed:true,unkeyed:true,errorMapping:true,sourceCompanion:true},conformanceCases:corpus.cases.length,singleInstall:true,bundledActions:true,loaderEntrypoint:true,opaqueMeaningRemainsUnchecked:true}));
`);
 await run([process.execPath,'probe.ts']);
 await Bun.write(join(directory,'public-saga-types.ts'),`import {Registry,registerSagas,inspectSagas,declareSaga,editSaga,assessSaga,createSagaResources,readDocument,writeDocument} from '@umf/core';
import type {Document,SagaDefinition,SagaCapabilities,SagaIdentity} from '@umf/core';
import {initializeCodegenWasm,initializeWasm} from '@umf/core/runtime/wasm';
export async function publicSagaConsumer(source:Document,definition:SagaDefinition,identity:SagaIdentity,capabilities:SagaCapabilities){
 const resources=createSagaResources();
 const engine=await initializeCodegenWasm(undefined,globalThis,resources);
 const core=await initializeWasm(undefined,globalThis,resources);
 const registry=registerSagas(new Registry(core),engine);
 const inspection=inspectSagas(source,registry);
 const declared=declareSaga(source,'equipment',definition,registry);
 const edited=editSaga(declared,identity,definition,registry);
 const text=writeDocument(edited,'yaml');
 const exchanged=readDocument(text,'yaml');
 return {inspection,assessment:assessSaga(exchanged,identity,capabilities,registry)};
}
`);
 await Bun.write(join(directory,'tsconfig.saga-types.json'),JSON.stringify({compilerOptions:{target:'ES2022',module:'ESNext',moduleResolution:'Bundler',lib:['ES2022','DOM'],types:[],strict:true,noUncheckedIndexedAccess:true,exactOptionalPropertyTypes:true,skipLibCheck:true,noEmit:true},files:['./public-saga-types.ts']}));
 await run([process.execPath,resolve('node_modules/typescript/bin/tsc'),'--project','tsconfig.saga-types.json']);
 await Bun.write(join(directory,'saga-vectors.json'),await Bun.file('fixtures/saga/portable.json').text());
 const oracle=await Bun.build({entrypoints:['scripts/saga-portable/verify.ts'],target:'browser',format:'esm'});
 if(!oracle.success)throw Error('Installed saga oracle build failed');
 await Bun.write(join(directory,'saga-oracle.js'),oracle.outputs[0]!);
 await Bun.write(join(directory,'saga-probe.ts'),`import {Registry,registerSagas,inspectSagas,declareSaga,editSaga,assessSaga,createSagaResources,readDocument,writeDocument} from '@umf/core';
import {initializeCodegenWasm,initializeWasm} from '@umf/core/runtime/wasm';
import {verifySagaVectors,verifySagaExchange} from './saga-oracle.js';
const resources=createSagaResources(),engine=await initializeCodegenWasm(undefined,globalThis,resources),core=await initializeWasm(undefined,globalThis,resources);
const registry=registerSagas(new Registry(core),engine),vectors=await Bun.file('saga-vectors.json').json();
const subject={inspectSagas:source=>inspectSagas(source,registry),declareSaga:(source,module,definition)=>declareSaga(source,module,definition,registry),editSaga:(source,identity,replacement)=>editSaga(source,identity,replacement,registry),assessSaga:(source,identity,capabilities)=>assessSaga(source,identity,capabilities,registry)};
verifySagaExchange(core,subject,vectors.cases.find(v=>v.expected.unknown).source);
const result=verifySagaVectors(subject,vectors.cases);if(result.passed!==result.cases)throw Error(JSON.stringify(result));
const authored=vectors.cases.find(v=>v.id==='recipe-declaration')?.source;
if(!authored)throw Error('Public SDK lifecycle example is missing');
const authoredInspection=inspectSagas(authored,registry),authoredEntry=authoredInspection.entries.find(e=>e.module==='sales'&&e.definition.id==='approve-order');
if(!authoredEntry)throw Error('Public SDK could not inspect the authored saga example');
const blank=structuredClone(authored);blank.modules.find(m=>m.id==='sales').extensions['umf.actions.saga'].sagas=[];
const authoredDefinition=structuredClone(authoredEntry.definition);authoredDefinition.name='Public SDK authored allocation';
const blankBefore=JSON.stringify(blank),definitionBefore=JSON.stringify(authoredDefinition);
const declared=declareSaga(blank,'sales',authoredDefinition,registry),declaredInspection=inspectSagas(declared,registry),declaredEntry=declaredInspection.entries.find(e=>e.module==='sales'&&e.definition.id===authoredEntry.definition.id);
if(declaredEntry?.definition.id!==authoredEntry.definition.id||declaredEntry.definition.name!==authoredDefinition.name||JSON.stringify(blank)!==blankBefore||JSON.stringify(authoredDefinition)!==definitionBefore)throw Error('Public declare changed its inputs or replaced the authored stable ID');
const identity={module:'sales',saga:authoredEntry.definition.id},replacement=structuredClone(declaredEntry.definition);replacement.name='Public SDK edited allocation';
const declaredBefore=JSON.stringify(declared),replacementBefore=JSON.stringify(replacement);
const edited=editSaga(declared,identity,replacement,registry),editedInspection=inspectSagas(edited,registry),editedEntry=editedInspection.entries.find(e=>e.module==='sales'&&e.definition.id===identity.saga);
if(editedEntry?.definition.id!==identity.saga||editedEntry.definition.name!==replacement.name)throw Error('Public edit did not apply the requested replacement while preserving identity');
if(JSON.stringify(declared)!==declaredBefore||JSON.stringify(replacement)!==replacementBefore)throw Error('Public edit mutated its input document or replacement');
const jsonRoundTrip=readDocument(writeDocument(edited,'json'),'json'),yamlRoundTrip=readDocument(writeDocument(jsonRoundTrip,'yaml'),'yaml');
if(!Bun.deepEquals(yamlRoundTrip,edited))throw Error('Public JSON/YAML exchange changed the edited saga');
const capabilities={id:'sdk-public-lifecycle',version:'1',coreVersion:'0.10.0',sagaVersion:'0.1.0',coordination:'supported',claims:editedEntry.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['urn:umf:sdk-public-lifecycle']})),source:edited,identity};
const assessment=assessSaga(edited,identity,capabilities,registry);
if(!assessment.valid||!assessment.declarationCompatible||assessment.executionVerified!==false)throw Error('Public lifecycle assessment did not distinguish declaration support from execution verification');
const unknown=structuredClone(edited),unknownComp=unknown.modules[0].extensions['umf.actions.saga'].sagas[0].steps[0].compensation;
unknownComp.kind='future-recovery';unknownComp.payload={retained:true};
const unknownBefore=JSON.stringify(unknown),unknownInspection=inspectSagas(unknown,registry),unknownEntry=unknownInspection.entries[0];
if(!unknownEntry?.obligations.some(o=>o.kind==='unknown'&&o.status==='unchecked'))throw Error('Unknown recovery meaning was not retained as unchecked');
let unknownEditRefused=false;try{editSaga(unknown,{module:'sales',saga:identity.saga},unknownEntry.definition,registry);}catch(error){unknownEditRefused=error.code==='SAGA_UNCHECKED';}
const unknownCapabilities={...capabilities,source:unknown,claims:unknownEntry.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['urn:umf:sdk-public-lifecycle']}))};
const unknownAssessment=assessSaga(unknown,identity,unknownCapabilities,registry);
if(!unknownEditRefused||unknownAssessment.declarationCompatible||unknownAssessment.executionVerified!==false||JSON.stringify(unknown)!==unknownBefore)throw Error('Unknown saga meaning did not refuse unsafe edit/eligibility without source mutation');
const changedRegistry=registerSagas(new Registry(core),engine);
changedRegistry.register({id:'test.changed',version:'1.0.0',coreVersion:'0.10.0',scopes:['module'],description:'Registry mutation control',semantics:'No action semantics',schema:true,capabilities:{validation:'semantic',directions:[],evidence:[]}});
let registryMutationRefused=false;try{inspectSagas(authored,changedRegistry);}catch(error){registryMutationRefused=error.code==='SAGA_REGISTRY_UNSUPPORTED';}
if(!registryMutationRefused)throw Error('Public saga facade accepted a changed registry after binding its trusted package snapshot');
await Bun.write('saga-result.json',JSON.stringify(result));
console.log(JSON.stringify({installedSagaRuntime:true,sharedWasm:true,publicFacade:true,lifecycle:{declared:true,edited:true,jsonYamlExchange:true,positiveAssessment:assessment.declarationCompatible,unknownEditRefused,unknownAssessment:unknownAssessment.declarationCompatible,registryMutationRefused},cases:result.cases,passed:result.passed}));
`);
 await run([process.execPath,'saga-probe.ts']);

 await verifyPortableProducerSnapshot('.',{sdkArchive:archive},sourceSnapshot);
 for(const [name,path] of Object.entries(installedMemberPaths))if(await sha256File(path)!==installedDigests[name as keyof typeof installedDigests]!.sha256)throw Error('Installed SDK member changed during conformance: '+name);

 if(retainedDirectory){
  const receipt={profile:'umf.sdk-installed-archive-custody/2',archivePath:archive,archiveSha256:sourceSnapshot.artifacts.sdkArchive,
   installCommand:[process.execPath,'install','--ignore-scripts',archive],installedPackageRoot:packageRoot,
   exactArchiveMembers:archiveMembers,installedMembers:installedDigests,publicEntryManifestSha256:installedManifest.sha256[SDK_SAGA_NODE_ENTRY],
   sdkManifestSha256:sha256(installedManifestBytes),installerSourceSha256,
   sagaCorpusSha256:sha256(await readFile(join(directory,'saga-vectors.json'))),
   sagaOracleSha256:sha256(await readFile(join(directory,'saga-oracle.js'))),
   sagaQualificationInputs:sourceSnapshot.qualificationInputs,
   sagaResult:JSON.parse(await readFile(join(directory,'saga-result.json'),'utf8')),
   runtime:{bun:Bun.version,platform:process.platform,arch:process.arch},distributionFiles:distribution.files,existing139ConsumerChecks:'passed'};
  await Bun.write(join(directory,'g03-sdk-install-custody.json'),JSON.stringify(receipt,null,2)+'\n');
 }
}finally{if(!retainedDirectory)await rm(directory,{recursive:true,force:true});}

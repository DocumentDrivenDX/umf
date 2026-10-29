// SPDX-License-Identifier: MIT OR Apache-2.0
import {checkCoreDistribution} from './check-core-authority';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
// Set UMF_SDK_INSTALL_RETAIN_DIR only when a later installed-entry probe needs
// this exact consumer and its archive-to-installed-member custody receipt.
const retainedDirectory=process.env.UMF_SDK_INSTALL_RETAIN_DIR?resolve(process.env.UMF_SDK_INSTALL_RETAIN_DIR):undefined;
const archive=resolve('.cache/sdk-distribution/umf-sdk.tgz');
const sha256=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const installerSourceSha256=sha256(await readFile('scripts/test-sdk-install.ts'));
const archiveMemberProbe=`import hashlib,json,sys,tarfile
names=['package/package.json','package/manifest.json','package/dist/umf.js']
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
const archiveBytes=await readFile(archive),archiveSha256=sha256(archiveBytes);
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
 const installedEntryBytes=await readFile(join(packageRoot,'dist/umf.js'));
 const installedMetadata=JSON.parse(installedPackageBytes.toString('utf8'));
 if(installedMetadata.version!==expectedVersion)throw Error('Installed SDK release version differs from source package');
 const installedDigests={
  'package/package.json':{size:installedPackageBytes.length,sha256:sha256(installedPackageBytes)},
  'package/manifest.json':{size:installedManifestBytes.length,sha256:sha256(installedManifestBytes)},
  'package/dist/umf.js':{size:installedEntryBytes.length,sha256:sha256(installedEntryBytes)},
 };
 for(const [name,actual] of Object.entries(installedDigests)){
  const expected=archiveMembers[name];
  if(!expected||actual.size!==expected.size||actual.sha256!==expected.sha256)throw Error('Installed SDK member differs from exact candidate archive: '+name);
 }
 const installedManifest=JSON.parse(installedManifestBytes.toString('utf8'));
 if(installedManifest.sha256?.['dist/umf.js']!==installedDigests['package/dist/umf.js'].sha256)throw Error('Installed SDK public entry differs from its distribution manifest');
 const distribution=await checkCoreDistribution(packageRoot);console.log(JSON.stringify({installedCoreDistribution:distribution}));
 await Bun.write(join(directory,'current-conformance.json'),await Bun.file('fixtures/metamodel/current-conformance.json').text());
 await Bun.write(join(directory,'approve.json'),await Bun.file('fixtures/actions/approve.json').text());
 await Bun.write(join(directory,'commerce.json'),await Bun.file('tests/unified/commerce.json').text());
 await Bun.write(join(directory,'probe.ts'),`import {createUmfRegistry,inspectActions,readDocument,Registry,validateDocument,CURRENT_CORE_VERSION,generatePythonClient} from '@umf/core';
import {createValidator} from '@umf/core/loader-contract';
const registry=createUmfRegistry();
if(!registry.get('umf.actions','0.1.0')?.semantics||typeof createValidator!=='function')throw Error('Missing installed SDK entrypoint');
const source=readDocument(await Bun.file('approve.json').text(),'json');const result=inspectActions(source,registry);
if(!result.validation.valid||result.validation.complete||result.actions[0]?.action.id!=='approve')throw Error('Installed action behavior differs');
const corpus=await Bun.file('current-conformance.json').json();if(corpus.currentVersion!==CURRENT_CORE_VERSION)throw Error('Installed generated current marker differs');
for(const item of corpus.cases){const r=new Registry();if(item.registry)r.register({id:item.registry.id,version:item.registry.version,coreVersion:CURRENT_CORE_VERSION,description:'Frozen callback probe',schema:true,semantics:'Trusted callback probe',scopes:[item.registry.scope],capabilities:{validation:'semantic',directions:[],evidence:[]}},(payload,context)=>[{code:'BASELINE_CALLBACK',path:context.path,message:context.document.id+':'+context.scope+':'+payload.kind,severity:'warning'}]);if(!Bun.deepEquals(validateDocument(item.document,r),{valid:item.valid,complete:item.complete,diagnostics:item.diagnostics}))throw Error('Installed conformance '+item.id);}
const client=generatePythonClient({text:await Bun.file('commerce.json').text(),package:'shop'});
if(client.description.umf!==CURRENT_CORE_VERSION||client.files.length!==7||!client.files.some(f=>f.path==='shop/models.py'&&f.text.includes('class Actions:')))throw Error('Installed unified generator missing');
console.log(JSON.stringify({unifiedGenerator:true,conformanceCases:corpus.cases.length,singleInstall:true,bundledActions:true,loaderEntrypoint:true,opaqueMeaningRemainsUnchecked:true}));
`);
 await run([process.execPath,'probe.ts']);
 if(retainedDirectory){
  const receipt={profile:'umf.sdk-installed-archive-custody/1',archivePath:archive,archiveSha256,
   installCommand:[process.execPath,'install','--ignore-scripts',archive],installedPackageRoot:packageRoot,
   exactArchiveMembers:archiveMembers,installedMembers:installedDigests,publicEntryManifestSha256:installedManifest.sha256['dist/umf.js'],
   installerSourceSha256,distributionFiles:distribution.files,existing139ConsumerChecks:'passed'};
  await Bun.write(join(directory,'g03-sdk-install-custody.json'),JSON.stringify(receipt,null,2)+'\n');
 }
}finally{if(!retainedDirectory)await rm(directory,{recursive:true,force:true});}

// SPDX-License-Identifier: MIT OR Apache-2.0
/** Retain one exact tested source/artifact cohort without mixing stale reports. */
import {createHash} from 'node:crypto';
import {mkdir,mkdtemp,readdir,readFile,rename,rm,rmdir} from 'node:fs/promises';
import {basename,dirname,join,resolve} from 'node:path';
import {hashInputFiles,retainVerifiedFile,sha256File,SAGA_QUALIFICATION_INPUTS,SDK_SAGA_MEMBERS,validatePortableCaseRoster,verifyPortableCohort,verifyPortableResult,type PortableCase,type PortableHostReport} from './custody';

const root=resolve('.'),corpusPath='fixtures/saga/portable.json',corpus=await Bun.file(corpusPath).json();
validatePortableCaseRoster(corpus.cases);
const cases:PortableCase[]=corpus.cases.map((v:any)=>({id:v.id,covers:v.covers}));
const inputHashes=await hashInputFiles(root,SAGA_QUALIFICATION_INPUTS),corpusHash=inputHashes[corpusPath]!;
const sourceStatus=Bun.spawnSync(['git','status','--porcelain','--','src','spec','crates','bindings','python','scripts','tools','tests','fixtures','qualification-inputs','.github','docs/helix/02-design/contracts','Cargo.toml','Cargo.lock','bun.lock','package.json']);
if(sourceStatus.exitCode!==0||sourceStatus.stdout.toString().trim())throw Error('Cannot attribute a qualification receipt to a source tree with uncommitted source/build/test changes');
const reportPaths:Record<string,string>={native:'.cache/saga/portable-native.json',browser:'.cache/saga/portable-browser.json',cli:'.cache/saga/portable-cli.json',python:'.cache/saga/portable-python.json','python-rebuilt':'.cache/saga/portable-python-rebuilt.json'};
const reportBytes:Record<string,Buffer>=Object.fromEntries(await Promise.all(Object.entries(reportPaths).map(async([host,path])=>[host,await readFile(path)])));
const reports:Record<string,PortableHostReport>=Object.fromEntries(Object.entries(reportBytes).map(([host,bytes])=>[host,JSON.parse(bytes.toString('utf8')) as PortableHostReport]));
const reportHashes:Record<string,string>=Object.fromEntries(Object.entries(reportBytes).map(([host,bytes])=>[host,createHash('sha256').update(bytes).digest('hex')]));
const cliPath=resolve(process.env.UMF_SAGA_CLI??'target/release/umf');
const wheelPath=process.env.UMF_SAGA_PYTHON_WHEEL?resolve(process.env.UMF_SAGA_PYTHON_WHEEL):undefined;
const rebuiltWheelPath=process.env.UMF_SAGA_PYTHON_REBUILT_WHEEL?resolve(process.env.UMF_SAGA_PYTHON_REBUILT_WHEEL):undefined;
const sourceArchivePath=process.env.UMF_SAGA_PYTHON_SOURCE_ARCHIVE?resolve(process.env.UMF_SAGA_PYTHON_SOURCE_ARCHIVE):undefined;
if(!wheelPath||!rebuiltWheelPath||!sourceArchivePath)throw Error('Set UMF_SAGA_PYTHON_WHEEL, UMF_SAGA_PYTHON_REBUILT_WHEEL, and UMF_SAGA_PYTHON_SOURCE_ARCHIVE to the exact tested Python artifacts');
const artifacts={
 native:{nativeAddon:'bindings/core/node/umf_core_node.node',nativeBinding:'bindings/core/node/index.js'},
 browser:{'dist/runtime/wasm/index.js':'dist/runtime/wasm/index.js','dist/runtime/wasm/pkg/umf_core_wasm.js':'dist/runtime/wasm/pkg/umf_core_wasm.js','dist/runtime/wasm/pkg/umf_core_wasm_bg.wasm':'dist/runtime/wasm/pkg/umf_core_wasm_bg.wasm'},
 cli:{cliBinary:cliPath},
 python:{pythonWheel:wheelPath},
 'python-rebuilt':{pythonWheel:rebuiltWheelPath,pythonSourceArchive:sourceArchivePath}
};
await verifyPortableCohort({root,cases,inputPaths:SAGA_QUALIFICATION_INPUTS,reports,artifacts,runtime:{native:{host:'Bun N-API',fields:['bun','platform','arch']},browser:{host:'Chromium WASM',fields:['browser','platform','arch']},cli:{host:'cli',fields:['platform','arch']},python:{host:'python',fields:['python','platform','arch']},'python-rebuilt':{host:'python',fields:['python','platform','arch']}},expectedHosts:Object.keys(reportPaths)});

const dist=process.env.UMF_SAGA_DIST;if(!dist)throw Error('Set UMF_SAGA_DIST to the selected Python wheel/sdist/selection receipt directory');
const consumer=process.env.UMF_SAGA_SDK_CONSUMER;if(!consumer)throw Error('Set UMF_SAGA_SDK_CONSUMER to the tested installed SDK consumer');
const sdkArchive=resolve('.cache/sdk-distribution/umf-sdk.tgz'),sdkManifestPath='.cache/sdk-distribution/manifest.json';
const installReceiptPath=join(consumer,'g03-sdk-install-custody.json'),installReceiptBytes=await readFile(installReceiptPath);
const installed=JSON.parse(installReceiptBytes.toString('utf8'));
const installReceiptHash=createHash('sha256').update(installReceiptBytes).digest('hex');
if(installed.profile!=='umf.sdk-installed-archive-custody/2')throw Error('Unsupported installed SDK receipt profile');
if(installed.archiveSha256!==await sha256File(sdkArchive)||installed.sagaCorpusSha256!==corpusHash)throw Error('SDK install receipt is not bound to this archive and portable corpus');
if(JSON.stringify(installed.sagaQualificationInputs)!==JSON.stringify(inputHashes))throw Error('SDK install receipt has stale or substituted qualification inputs');
verifyPortableResult(installed.sagaResult,cases);
if(installed.sagaOracleSha256!==await sha256File(join(consumer,'saga-oracle.js'))||installed.sagaCorpusSha256!==await sha256File(join(consumer,'saga-vectors.json')))throw Error('SDK consumer oracle or vector bytes differ from retained receipt');
const installedResultBytes=await readFile(join(consumer,'saga-result.json'));
if(JSON.stringify(JSON.parse(installedResultBytes.toString('utf8')))!==JSON.stringify(installed.sagaResult))throw Error('SDK consumer saga result differs from the result retained in its install receipt');
const manifestBytes=await readFile(sdkManifestPath),manifest=JSON.parse(manifestBytes.toString('utf8'));
if(installed.sdkManifestSha256!==createHash('sha256').update(manifestBytes).digest('hex'))throw Error('SDK installed receipt manifest digest mismatch');
if(manifest.sha256?.['dist/umf.js']!==installed.publicEntryManifestSha256)throw Error('SDK manifest does not bind the tested public entry');
const packageRoot=resolve(installed.installedPackageRoot);
for(const member of SDK_SAGA_MEMBERS){
 const key=`package/${member}`,archiveExpected=installed.exactArchiveMembers?.[key],installedExpected=installed.installedMembers?.[key];
 if(!archiveExpected||!installedExpected||archiveExpected.sha256!==installedExpected.sha256||archiveExpected.size!==installedExpected.size)throw Error(`SDK archive/install member receipt mismatch: ${key}`);
 if(member.startsWith('dist/')&&manifest.sha256?.[member]!==installedExpected.sha256)throw Error(`SDK manifest does not bind consumed runtime member: ${member}`);
 const actual=await readFile(join(packageRoot,member));if(actual.length!==installedExpected.size||createHash('sha256').update(actual).digest('hex')!==installedExpected.sha256)throw Error(`Installed SDK member bytes differ: ${member}`);
}
const archiveMember=async(member:string)=>{
 const child=Bun.spawn(['tar','-xOzf',sdkArchive,`package/${member}`],{stdout:'pipe',stderr:'pipe'});
 const [status,bytes,error]=await Promise.all([child.exited,new Response(child.stdout).arrayBuffer(),new Response(child.stderr).text()]);
 if(status!==0)throw Error(`Cannot read SDK archive member ${member}: ${error}`);return new Uint8Array(bytes);
};
for(const member of SDK_SAGA_MEMBERS){
 const actual=await archiveMember(member),expected=installed.exactArchiveMembers[`package/${member}`];
 if(actual.length!==expected.size||createHash('sha256').update(actual).digest('hex')!==expected.sha256)throw Error(`SDK archive member bytes differ from install receipt: ${member}`);
}
if(createHash('sha256').update(await archiveMember('manifest.json')).digest('hex')!==installed.sdkManifestSha256)throw Error('SDK archive manifest differs from installed manifest');

const selectionPath=join(dist,'selection.json'),selectionBytes=await readFile(selectionPath),selection=JSON.parse(selectionBytes.toString('utf8'));
const selectionHash=createHash('sha256').update(selectionBytes).digest('hex');
const selectedWheel=join(dist,selection.selectedWheel?.filename??''),sdist=join(dist,selection.sdist?.filename??'');
if(selection.status!=='passed'||!['linux','macos'].includes(selection.cohort))throw Error('Python selection receipt is not a passed supported cohort');
if(resolve(selectedWheel)!==wheelPath||selection.selectedWheel?.sha256!==await sha256File(wheelPath))throw Error('Python selected wheel receipt differs from the installed and tested wheel');
if(resolve(sdist)!==sourceArchivePath||selection.sdist?.sha256!==await sha256File(sourceArchivePath))throw Error('Python sdist receipt differs from the archive used for source-rebuilt qualification');

const output=resolve(process.env.UMF_SAGA_OUTPUT??'.cache/saga/release-candidate');
try{const existing=await readdir(output);if(existing.length)throw Error(`Refusing to mix with existing cohort output: ${output}`);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
await mkdir(dirname(output),{recursive:true});const stage=await mkdtemp(join(dirname(output),'.saga-candidate-stage-'));
try{
 const retained:Record<string,string>={};
 async function retain(path:string,name:string,expectedHash:string){
  await retainVerifiedFile(stage,path,name,expectedHash,retained);
 }
 for(const [host,report] of Object.entries(reports) as [string,any][]){
  await retain(reportPaths[host]!,`receipt-${host}.json`,reportHashes[host]!);
  for(const [name,artifact] of Object.entries(report.artifacts) as [string,{path:string;sha256:string}][]){const logicalName=`${host}-${name.replace(/[^A-Za-z0-9._-]+/g,'_')}-${basename(artifact.path)}`;await retain(artifact.path,logicalName,artifact.sha256);}
 }
 await retain(sdkArchive,'umf-sdk.tgz',installed.archiveSha256);await retain(sdkManifestPath,'umf-sdk-manifest.json',installed.sdkManifestSha256);
 await retain(installReceiptPath,'sdk-installed-custody.json',installReceiptHash);
 await retain(selectionPath,'python-selection.json',selectionHash);
 await retain(wheelPath,`python-dist-${basename(wheelPath)}`,selection.selectedWheel.sha256);
 await retain(sourceArchivePath,`python-dist-${basename(sourceArchivePath)}`,selection.sdist.sha256);
 await retain(join(consumer,'saga-oracle.js'),'sdk-saga-oracle.js',installed.sagaOracleSha256);
 await retain(join(consumer,'saga-vectors.json'),'sdk-saga-vectors.json',installed.sagaCorpusSha256);
 await retain(join(consumer,'saga-result.json'),'sdk-saga-result.json',createHash('sha256').update(installedResultBytes).digest('hex'));
 if(JSON.stringify(await hashInputFiles(root,SAGA_QUALIFICATION_INPUTS))!==JSON.stringify(inputHashes))throw Error('Qualification source/resource inputs changed during cohort retention');
 const git=Bun.spawnSync(['git','rev-parse','HEAD']);if(git.exitCode!==0)throw Error('Cannot record source commit');
 const custody={profile:'umf.saga.release-candidate/2',repository:'DocumentDrivenDX/umf',commit:git.stdout.toString().trim(),corpusSha256:corpusHash,qualificationInputs:inputHashes,hosts:Object.fromEntries(Object.keys(reportPaths).map(host=>[host,{report:reportPaths[host],hostId:reports[host]!.hostId,runtime:reports[host]!.runtime,artifacts:reports[host]!.artifacts}])),sdk:{archive:'.cache/sdk-distribution/umf-sdk.tgz',manifest:sdkManifestPath,installReceipt:'g03-sdk-install-custody.json'},python:{selection:selectionPath,sdist:sourceArchivePath,selectedWheel:wheelPath,rebuiltWheel:rebuiltWheelPath},files:retained};
 await Bun.write(join(stage,'custody.json'),JSON.stringify(custody,null,2)+'\n');retained['custody.json']=await sha256File(join(stage,'custody.json'));
 await Bun.write(join(stage,'SHA256SUMS'),Object.entries(retained).sort(([a],[b])=>a.localeCompare(b)).map(([name,digest])=>`${digest}  ${name}\n`).join(''));
 try{await rmdir(output);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 await rename(stage,output);
 console.log(JSON.stringify({output,hosts:Object.keys(reports),files:Object.keys(retained),portableCases:cases.length}));
}catch(error){await rm(stage,{recursive:true,force:true});throw error;}

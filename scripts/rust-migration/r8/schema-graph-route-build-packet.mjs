// SPDX-License-Identifier: MIT OR Apache-2.0
// Assemble a review packet from an already-built SDK archive and route captures.
// This command never builds an SDK or performs host/browser route capture.
import {createHash} from 'node:crypto';
import {copyFile,mkdir,mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HARNESS_NAMES,OPERATION_NAMES,validateClaims,validatePacket,verifyDigest} from './schema-graph-route-evidence.mjs';
import {openArtifact} from './schema-graph-route-common.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canon=value=>Array.isArray(value)?`[${value.map(canon).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canon(value[k])}`).join(',')}}`:JSON.stringify(value);
function fail(message){throw new Error(String(message).slice(0,600));}
function optionsFrom(args){const out={};for(let i=0;i<args.length;i++){const k=args[i];if(!k.startsWith('--')||i+1>=args.length||Object.hasOwn(out,k))fail(`Invalid/duplicate option ${k}`);out[k]=args[++i];}for(const k of ['--archive','--output','--host-receipt','--chromium-receipt'])if(!out[k])fail(`Missing ${k}`);return out;}
function listArchive(archive){
  const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8',maxBuffer:64*1024*1024}).split(/\r?\n/).filter(Boolean);
  const verbose=execFileSync('tar',['-tvzf',archive],{encoding:'utf8',maxBuffer:64*1024*1024}).split(/\r?\n/).filter(Boolean);
  if(new Set(names).size!==names.length)fail('Archive contains duplicate entries');
  if(verbose.length!==names.length||verbose.some(line=>!['-','d'].includes(line[0])))fail('Archive contains non-regular members');
  for(const name of names){if(name.startsWith('/')||/^[A-Za-z]:/.test(name)||name.split('/').includes('..')||/[\0\r\n]/.test(name))fail('Archive contains unsafe member path');}
  return names.filter(name=>!name.endsWith('/'));
}
async function extractedFiles(dir,base=dir){const found=[];for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())found.push(...await extractedFiles(path,base));else if(entry.isFile())found.push(relative(base,path).split('\\').join('/'));else fail(`Extracted package contains a non-regular file: ${relative(base,path)}`);}return found;}
function sourceTree(sourceClosure){
  const inputs=sourceClosure.inputs;if(!inputs||typeof inputs!=='object'||Array.isArray(inputs))fail('SDK source input map is missing');
  const names=Object.keys(inputs).sort();if(names.length!==sourceClosure.fileCount)fail('SDK source file count differs from input map');
  const hash=createHash('sha256');const current={};
  for(const name of names){if(name.startsWith('/')||name.split('/').includes('..')||name.includes('\\'))fail(`Unsafe source path: ${name}`);const bytes=readFileSyncSafe(resolve(root,name));const digest=sha(bytes);if(digest!==inputs[name])fail(`Current source differs from SDK capture: ${name}`);current[name]=digest;hash.update(name);hash.update('\0');hash.update(bytes);hash.update('\0');}
  const digest=hash.digest('hex');if(digest!==sourceClosure.sha256||digest!==sourceClosure.capturedLiveSha256)fail('Current source tree is not the captured fixed point');
  if(sourceClosure.transform?.status!=='fixed-point'||sourceClosure.transform.generatedInputs?.length)fail('SDK source transform is not zero-change fixed point');
  return {format:'umf.r8.schema-graph-live-source/1',sourceClosure:{sha256:digest,capturedLiveSha256:digest,fileCount:names.length,transform:sourceClosure.transform,inputs:current}};
}
import fs from 'node:fs';
function readFileSyncSafe(path){return fs.readFileSync(path);}
async function writeJson(dir,name,value){await writeFile(join(dir,name),JSON.stringify(value,null,2)+'\n');}
function ensureEmpty(path){return readdir(path).then(entries=>{if(entries.length)fail('Output directory must be empty');}).catch(error=>{if(error.code!=='ENOENT')throw error;});}
function direct(hostReceipt,name){const sub=hostReceipt.hosts?.[name],operations=hostReceipt.operations;return {status:sub&&hostReceipt.status==='pass'?'pass':'fail',runtime:sub?.runtime,artifact:hostReceipt.artifact,operations};}
function negativeControlSuite(receipt,claims){
  const controls=[];const add=(name,change)=>{const r=structuredClone(receipt),c=structuredClone(claims);change(r,c);const result=validateClaims(r,c);if(result.status!=='fail')fail(`Negative control was accepted: ${name}`);controls.push({name,rejected:true,reason:result.reason});};
  add('source closure mutation',(r)=>{r.sourceClosure.sha256='0'.repeat(64);});
  add('archive member omission',(_r,c)=>{delete c.archiveMembers.members['dist/umf-node.js'];c.archiveMembers.archiveMemberCount--;c.archiveMembers.verifiedMemberCount--;});
  add('Node dispatch undercount',(_r,c)=>{c.node.operations[OPERATION_NAMES[0]].providerCalls=1;});
  add('Bun dispatch undercount',(_r,c)=>{c.bun.operations[OPERATION_NAMES[0]].providerCalls=1;});
  add('shared Node/Bun parity missing',(_r,c)=>{c.hostOutcome.nodeBunExactReceiptParity=false;});
  add('Chromium counter overclaim',(_r,c)=>{c.chromium.chromium.wasmCounters='directly-observed';});
  add('browser isolation failure',(_r,c)=>{c.chromium.chromium.nodeGlobalsAbsent=false;});
  const checksum=sha(Buffer.from('pinned content'));let rejected=false,reason='';try{verifyDigest(Buffer.from('tampered content'),checksum,'README.md');}catch(error){rejected=true;reason=error.message;}if(!rejected)fail('Checksum negative control was accepted');
  controls.push({name:'checksum tamper',rejected,reason});
  return {format:'umf.r8.schema-graph-negative-controls/1',status:'pass',baseline:validateClaims(receipt,claims),controls};
}

const args=optionsFrom(process.argv.slice(2));const archive=resolve(args['--archive']),packet=resolve(args['--output']);
const temporary=await mkdtemp(join(process.env.TMPDIR??'/tmp','umf-schema-graph-packet-'));
let artifact;
try{
  await ensureEmpty(packet);
  const entries=listArchive(archive);
  execFileSync('tar',['-xzf',archive,'-C',temporary,'--no-same-owner','--no-same-permissions'],{stdio:'ignore'});
  const packageRoot=join(temporary,'package'),dist=join(packageRoot,'dist');
  const sdkBytes=await readFile(join(dist,'rust-default-manifest.json')),sdkManifest=JSON.parse(sdkBytes.toString('utf8'));
  const packageBytes=await readFile(join(packageRoot,'package.json')),packageJson=JSON.parse(packageBytes.toString('utf8'));
  const packageManifestBytes=await readFile(join(packageRoot,'manifest.json')),packageManifest=JSON.parse(packageManifestBytes.toString('utf8'));
  artifact=await openArtifact({input:dist,'artifact-sha256':sha(sdkBytes),'package-json-sha256':sha(packageBytes),'package-manifest-sha256':sha(packageManifestBytes),'source-closure-sha256':sdkManifest.sourceClosure?.sha256},{requireBrowser:true});
  const hostRaw=JSON.parse(await readFile(resolve(args['--host-receipt']),'utf8'));
  const chromiumRaw=JSON.parse(await readFile(resolve(args['--chromium-receipt']),'utf8'));
  const node=direct(hostRaw,'node'),bun=direct(hostRaw,'bun');
  const chromium={status:chromiumRaw.status,artifact:chromiumRaw.artifact,chromium:chromiumRaw.chromium};
  const archiveBytes=await readFile(archive),members={};
  for(const name of entries){if(!name.startsWith('package/'))fail(`Archive member outside package/: ${name}`);const rel=name.slice('package/'.length);if(!rel)continue;const file=resolve(temporary,name);if(!file.startsWith(packageRoot+sep))fail(`Archive member escaped package root: ${name}`);members[rel]=sha(await readFile(file));}
  const extracted=await extractedFiles(packageRoot);if(canon([...extracted].sort())!==canon(Object.keys(members).sort()))fail('Archive member names differ from extracted regular-file set');
  if(members['manifest.json']!==sha(packageManifestBytes))fail('Archive package manifest bytes mismatch');
  if(canon(Object.fromEntries(Object.entries(members).filter(([name])=>name!=='manifest.json')))!==canon(packageManifest.sha256))fail('Archive members differ from embedded package manifest');
  const liveSource=sourceTree(sdkManifest.sourceClosure);
  const archiveMembers={format:'umf.r8.schema-graph-archive-members/1',status:'pass',algorithm:'sha256',archiveSha256:sha(archiveBytes),packageManifestSha256:members['manifest.json'],archiveMemberCount:Object.keys(members).length,verifiedMemberCount:Object.keys(members).length,members};
  const hostOutcome=hostRaw;const route={node,bun,chromium,hostOutcome};
  const harnesses={};for(const name of HARNESS_NAMES)harnesses[name]=sha(await readFile(join(root,'scripts/rust-migration/r8',name)));
  const receipt={format:'umf.r8.schema-graph-route-evidence/1',status:'pass',operations:OPERATION_NAMES,routeScope:'Private fixed-point Node/Bun installed package and Chromium browser bundle cohort; not release qualification or declaration retirement.',sourceClosure:{sha256:liveSource.sourceClosure.sha256,capturedLiveSha256:liveSource.sourceClosure.capturedLiveSha256,fileCount:liveSource.sourceClosure.fileCount,transform:liveSource.sourceClosure.transform,liveSourceManifest:{path:'liveSource.json',sha256:''}},archive:{path:relative(root,archive).split('\\').join('/'),archiveSha256:archiveMembers.archiveSha256,packageManifestSha256:archiveMembers.packageManifestSha256,archiveMemberCount:archiveMembers.archiveMemberCount,memberManifest:{path:'archiveMembers.json',sha256:''},packageManifestFile:{path:'archive-package-manifest.json',sha256:''},sdkManifestFile:{path:'archive-sdk-manifest.json',sha256:''},packageJsonFile:{path:'archive-package.json',sha256:''}},harnesses:Object.fromEntries(HARNESS_NAMES.map(name=>[name,{path:name,sha256:harnesses[name]}])),routes:{node:{path:'node.json',sha256:''},bun:{path:'bun.json',sha256:''},hostOutcome:{path:'host-outcome.json',sha256:''},chromium:{path:'chromium.json',sha256:''}}};
  const claims={node,bun,chromium,hostOutcome,liveSource,archiveMembers,packageManifest,sdkManifest,packageJson,harnesses};
  const checked=validateClaims(receipt,claims);if(checked.status!=='pass')fail(`Route/source/archive validation failed: ${checked.reason}`);
  await mkdir(packet,{recursive:true});
  for(const [name,value] of Object.entries({node,bun,chromium,liveSource,archiveMembers}))await writeJson(packet,`${name==='liveSource'?'liveSource':name==='archiveMembers'?'archiveMembers':name}.json`,value);
  await writeJson(packet,'host-outcome.json',hostOutcome);
  await writeFile(join(packet,'archive-package-manifest.json'),packageManifestBytes);await writeFile(join(packet,'archive-sdk-manifest.json'),sdkBytes);await writeFile(join(packet,'archive-package.json'),packageBytes);
  for(const name of HARNESS_NAMES)await copyFile(join(root,'scripts/rust-migration/r8',name),join(packet,name));
  receipt.sourceClosure.liveSourceManifest.sha256=sha(await readFile(join(packet,'liveSource.json')));
  receipt.archive.memberManifest.sha256=sha(await readFile(join(packet,'archiveMembers.json')));
  receipt.archive.packageManifestFile.sha256=sha(packageManifestBytes);receipt.archive.sdkManifestFile.sha256=sha(sdkBytes);receipt.archive.packageJsonFile.sha256=sha(packageBytes);
  for(const name of ['node','bun','chromium'])receipt.routes[name].sha256=sha(await readFile(join(packet,`${name}.json`)));
  receipt.routes.hostOutcome.sha256=sha(await readFile(join(packet,'host-outcome.json')));
  await writeJson(packet,'receipt.json',receipt);
  const negativeControls=negativeControlSuite(receipt,claims);await writeJson(packet,'negative-controls.json',negativeControls);
  const readme=`# R8 five-schema default-route packet\n\nThis packet captures a private fixed-point SDK archive and the five schema graph generators: ${OPERATION_NAMES.join(', ')}. The shared Node ${node.runtime}/Bun ${bun.runtime} replay asserted exact receipt parity and two direct native provider calls per export; the packet retains that shared outcome and does not claim independent per-host operation maps. Chromium exercised the browser bundle and adjacent WASM in real Chromium ${chromium.chromium.version}; its direct WASM provider counters are **unobserved** and are not inferred from wrapper execution. The packet records a complete archive-member SHA-256 map and rehashes every source input against current live files. This is scoped private evidence, not release qualification and not retirement evidence.\n`;
  await writeFile(join(packet,'README.md'),readme);
  const files=(await readdir(packet)).filter(name=>name!=='SHA256SUMS').sort();let lines='';for(const name of files)lines+=`${sha(await readFile(join(packet,name)))}  ${name}\n`;await writeFile(join(packet,'SHA256SUMS'),lines);
  const packetCheck=await validatePacket(packet,{repositoryRoot:root,archivePath:archive});if(packetCheck.status!=='pass')fail(`Built packet failed validation: ${packetCheck.reason}`);
  process.stdout.write(`${JSON.stringify({status:'pass',packet,archiveSha256:archiveMembers.archiveSha256,sourceClosureSha256:liveSource.sourceClosure.sha256,sourceFileCount:liveSource.sourceClosure.fileCount,archiveMemberCount:archiveMembers.archiveMemberCount,operations:OPERATION_NAMES,wasmCounters:chromium.chromium.wasmCounters})}\n`);
}finally{if(artifact)await artifact.cleanup();await rm(temporary,{recursive:true,force:true});}

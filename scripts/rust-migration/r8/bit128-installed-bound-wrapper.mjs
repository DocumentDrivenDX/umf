// SPDX-License-Identifier: MIT OR Apache-2.0
// Process-bound wrapper for the governed Bit128 replay. It verifies the exact
// archive/source cohort and observes the native addon loaded by each child.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const harness=path.join(repo,'docs/helix/04-build/evidence/rust-migration/r8-bit128-installed/bit128-installed-replay.mjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const fail=(condition,message)=>{if(!condition)throw new Error(message)};

function liveTree(inputs){
  const h=crypto.createHash('sha256');
  for(const name of Object.keys(inputs).sort()){
    if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw new Error(`unsafe source input path: ${name}`);
    const bytes=fs.readFileSync(path.resolve(repo,name));
    if(sha(bytes)!==inputs[name])throw new Error(`current source drift: ${name}`);
    h.update(name);h.update('\0');h.update(bytes);h.update('\0');
  }
  return h.digest('hex');
}

export function verifyAndRunBit128Archive({archive,expectedArchiveSha256,expectedClosureSha256,outputPath}={}){
  if(!archive||!expectedArchiveSha256||!expectedClosureSha256||!outputPath)throw new Error('usage: <umf-sdk.tgz> <archive-sha256> <closure-sha256> <receipt.json-under-repository>');
  const absoluteOutput=path.resolve(outputPath),outputRelative=path.relative(repo,absoluteOutput);
  if(outputRelative.startsWith('..')||path.isAbsolute(outputRelative))throw new Error('process-bound receipt output must be repository-relative');
  const archivePath=path.resolve(archive),archiveBytes=fs.readFileSync(archivePath),archiveSha256=sha(archiveBytes);
  if(archiveSha256!==expectedArchiveSha256)throw new Error('archive SHA-256 mismatch');
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'umf-r8-bit128-bound-'));
  try{
    const listing=execFileSync('tar',['-tzf',archivePath],{encoding:'utf8'}).split('\n').filter(Boolean);
    if(listing.some(name=>name.startsWith('/')||name.split('/').includes('..')||!name.startsWith('package/')))throw new Error('archive contains an unsafe or unexpected member path');
    execFileSync('tar',['-xzf',archivePath,'-C',temp],{stdio:'ignore'});
    const pkg=path.join(temp,'package'),manifestBytes=fs.readFileSync(path.join(pkg,'manifest.json')),manifest=JSON.parse(manifestBytes);
    const memberHashes=manifest.sha256;
    if(!memberHashes||typeof memberHashes!=='object'||Object.keys(memberHashes).length===0)throw new Error('archive package manifest has no member hashes');
    for(const [name,expected] of Object.entries(memberHashes)){
      if(path.isAbsolute(name)||name.split(/[\\/]/).includes('..'))throw new Error(`unsafe archive manifest member: ${name}`);
      if(sha(fs.readFileSync(path.join(pkg,name)))!==expected)throw new Error(`archive member hash mismatch: ${name}`);
    }
    const sdkManifest=JSON.parse(fs.readFileSync(path.join(pkg,'dist/rust-default-manifest.json'),'utf8')),closure=sdkManifest.sourceClosure;
    if(closure.sha256!==expectedClosureSha256||closure.capturedLiveSha256!==expectedClosureSha256||closure.transform?.status!=='fixed-point'||closure.transform.generatedInputs?.length!==0)throw new Error('archive source closure is not the expected fixed point');
    if(Object.keys(closure.liveInputs??{}).length!==closure.fileCount||liveTree(closure.liveInputs)!==expectedClosureSha256)throw new Error('current live source closure does not match archive');
    const entry=path.join(pkg,'dist/umf-node.js'),addon=path.join(pkg,'dist/umf_core_node.node');
    for(const required of ['dist/umf-node.js','dist/umf_core_node.node'])if(!memberHashes[required])throw new Error(`archive manifest omits ${required}`);
    const addonSha256=sha(fs.readFileSync(addon));
    if(addonSha256!==memberHashes['dist/umf_core_node.node'])throw new Error('adjacent native addon does not match archive member manifest');
    const preload=path.join(temp,'observe-native-addon.cjs'),preloadSource=`const path=require('node:path');const fs=require('node:fs');process.on('exit',()=>fs.writeFileSync(process.env.UMF_NATIVE_ADDON_OBSERVED,JSON.stringify(Object.keys(require.cache).filter(name=>name.endsWith('.node')).map(name=>path.resolve(name)))));`;
    fs.writeFileSync(preload,preloadSource);
    const outputs=[];
    for(const runtime of ['node','bun']){
      const rawReceipt=path.join(temp,`${runtime}.json`),observedPath=path.join(temp,`${runtime}-loaded-addons.json`);
      const env={...process.env,UMF_R8_BIT128_ENTRY:entry,UMF_R8_BIT128_RECEIPT:rawReceipt,UMF_NATIVE_ADDON_OBSERVED:observedPath};
      if(runtime==='node')execFileSync('node',['--require',preload,harness],{cwd:repo,env,stdio:'ignore'});
      else execFileSync('bun',['--preload',preload,harness],{cwd:repo,env,stdio:'ignore'});
      const rawBytes=fs.readFileSync(rawReceipt),raw=JSON.parse(rawBytes),observed=JSON.parse(fs.readFileSync(observedPath,'utf8'));
      fail(raw.status==='pass'&&raw.exactFrozenPacketParity===true,`${runtime} governed replay failed`);
      const realAddon=fs.realpathSync(addon);
      fail(observed.some(name=>fs.realpathSync(name)===realAddon),`${runtime} process did not load the archive-adjacent native addon`);
      fail(sha(fs.readFileSync(addon))===addonSha256,'native addon changed during replay');
      const rawPath=`${absoluteOutput}.${runtime}.raw.json`;fs.writeFileSync(rawPath,rawBytes);
      outputs.push({runtime,rawReceipt:{path:path.relative(repo,rawPath),sha256:sha(rawBytes)},rawCaseCount:raw.caseCount,rawReplayPass:raw.status,entrySha256:sha(fs.readFileSync(entry)),nativeAddonSha256:addonSha256,nativeAddonLoadedInProcess:true,nativeAddonLoadedPath:realAddon,observedNativeAddons:observed});
    }
    const receipt={format:'umf.r8.bit128-installed-process-bound/1',status:'pass',archive:{path:archivePath,sha256:archiveSha256,packageManifestSha256:sha(manifestBytes),verifiedMemberCount:Object.keys(memberHashes).length},sourceClosure:{sha256:closure.sha256,capturedLiveSha256:closure.capturedLiveSha256,fileCount:closure.fileCount,currentSourceStatus:'current-source',transform:closure.transform},predecessor:{path:'scripts/rust-migration/r5/bit128-default-route/predecessor.json',sha256:sha(fs.readFileSync(path.join(repo,'scripts/rust-migration/r5/bit128-default-route/predecessor.json')))},harness:{path:path.relative(repo,harness),sha256:sha(fs.readFileSync(harness))},hosts:outputs,limits:'Binds replay child processes to the selected archive entry and adjacent Node addon. Chromium remains covered by its separate browser harness.'};
    fs.writeFileSync(absoluteOutput,JSON.stringify(receipt,null,2)+'\n');
    return receipt;
  }finally{fs.rmSync(temp,{recursive:true,force:true});}
}

function main(){
  const [archive,expectedArchiveSha256,expectedClosureSha256,outputPath]=process.argv.slice(2);
  const result=verifyAndRunBit128Archive({archive,expectedArchiveSha256,expectedClosureSha256,outputPath});
  process.stdout.write(`${JSON.stringify(result,null,2)}\n`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main();

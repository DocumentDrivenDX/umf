// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

export function decodeCoreRequestOperation(wire){
 const envelope=typeof wire==='string'?JSON.parse(wire):wire;
 if(envelope?.kind!=='object'||!Array.isArray(envelope.members))throw new Error('Rust wire operation envelope shape mismatch');
 const matching=envelope.members.filter(item=>Array.isArray(item?.key)&&item.key.length===2&&item.key[0]===111&&item.key[1]===112);
 if(matching.length!==1)throw new Error('Rust wire operation member must occur exactly once');
 const units=matching[0].value?.units;
 if(matching[0].value?.kind!=='string'||!Array.isArray(units)||units.length<1||units.length>128||!units.every(unit=>Number.isInteger(unit)&&unit>=0&&unit<=0xffff))throw new Error('Rust wire operation string shape mismatch');
 return String.fromCharCode(...units);
}

export async function verifySourceClosure({repoRoot,sourceClosure,expectedSha256}){
 assert.equal(sourceClosure.sha256,expectedSha256,'archive source closure pin');
 assert.equal(sourceClosure.capturedLiveSha256,expectedSha256,'captured source closure pin');
 const sourceHash=createHash('sha256'),inputs=Object.entries(sourceClosure.liveInputs??{}).sort(([a],[b])=>a<b?-1:a>b?1:0);
 assert(inputs.length>0,'source closure inputs are empty');
 for(const [relative,expected] of inputs){
  assert(!relative.startsWith('/')&&!relative.split(/[\\/]/).includes('..'),`unsafe source path ${relative}`);
  const bytes=await readFile(resolve(repoRoot,relative));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,`current source input ${relative}`);
  sourceHash.update(relative);sourceHash.update('\0');sourceHash.update(bytes);sourceHash.update('\0');
 }
 const actual=sourceHash.digest('hex');assert.equal(actual,expectedSha256,'current source closure');
 const external=Object.entries(sourceClosure.externalInputs??{});
 for(const [relative,expected] of external){
  assert(!relative.startsWith('/')&&!relative.split(/[\\/]/).includes('..'),`unsafe external input path ${relative}`);
  const bytes=await readFile(resolve(repoRoot,relative));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,`external build input ${relative}`);
 }
 return {sha256:actual,fileCount:inputs.length,externalInputCount:external.length};
}

export function validateLock(lock){
 assert.equal(lock.lockfileVersion,3,'npm lockfile v3 required');
 const entries=Object.entries(lock.packages??{}).filter(([key])=>key&&key!=='node_modules/@umf/core');
 assert(entries.length>0,'resolved dependency tree is empty');
 for(const [key,value] of entries)assert.match(value.integrity??'',/^sha(1|512|384)-[A-Za-z0-9+/]+=*$/,`missing/invalid integrity for ${key}`);
}

export function validateIdentity(pkg,lock,installedRoot,consumerRoot,archivePath,archiveIntegrity){
 assert.equal(pkg.name,'@umf/core','installed package name');
 const entry=lock.packages['node_modules/@umf/core'];
 assert.equal(entry?.version,pkg.version,'lock/package version');
 assert.equal(typeof entry?.resolved,'string','lock archive source missing');
 assert.equal(entry.resolved.startsWith('file:'),true,'lock archive must be local');
 assert.equal(resolve(consumerRoot,decodeURIComponent(entry.resolved.slice(5))),resolve(archivePath),'lock archive source');
 assert.equal(entry.integrity,archiveIntegrity,'lock archive integrity');
 assert.equal(resolve(installedRoot),resolve(consumerRoot,'node_modules/@umf/core'),'installed package location');
 assert.equal(pkg.exports?.['.']?.node,'./dist/umf-node.js','Node default export route');
 assert.equal(pkg.exports?.['.']?.browser,'./dist/umf-browser.js','browser default export route');
 assert.equal(pkg.exports?.['./reference']?.import,'./dist/umf.js','reference export route');
}

export function validateRouteResolution(routes,installedRoot){
 for(const [runtime,result] of Object.entries(routes)){
  for(const route of [result.root,result.reference])assert(new URL(route).pathname.startsWith(resolve(installedRoot)+'/'),`${runtime} route escaped installed package: ${route}`);
  assert(result.root.endsWith('/dist/umf-node.js'),`${runtime} default route`);
  assert(result.reference.endsWith('/dist/umf.js'),`${runtime} reference route`);
 }
}

export function coreFacetsCohortForHost(platform,arch){
 if(platform==='darwin'&&arch==='arm64')return 'darwin-arm64';
 if(platform==='linux'&&arch==='x64')return 'linux-x86_64';
 throw new Error(`unsupported host for Core Facets gate: ${platform}/${arch}`);
}

export function assessLinuxX64NativeFormat({platform,arch,nativeMembers,nativeFormat}){
 const compatible=/ELF 64-bit.*x86-64/.test(nativeFormat);
 return {status:'asset-format-inspection',execution:'assessed-separately-by-host-replay-receipts',currentHost:{platform,arch},nativeAsset:{members:nativeMembers,format:nativeFormat},linuxX64Compatibility:compatible?'native-format-compatible':'native-format-incompatible',dependencyScope:`offline npm dependency resolution and host replays were performed on ${platform}/${arch}`};
}

export function exerciseNegativeControls({pkg,lock,installedRoot,consumerRoot,archivePath,archiveIntegrity,routes,validators={validateLock,validateIdentity,validateRouteResolution}}){
 const rejected=(label,expected,operation)=>{
  try{operation();}catch(error){
   const message=error?.message??String(error);
   if(!expected.test(message))throw new Error(`unexpected refusal for ${label}: ${message}`,{cause:error});
   return true;
  }
  throw new Error(`negative control failed to reject ${label}`);
 };
 const dependencyLock=structuredClone(lock),dependency=Object.keys(dependencyLock.packages).find(key=>key&&key!=='node_modules/@umf/core');
 assert(dependency,'negative control requires a resolved dependency');
 delete dependencyLock.packages[dependency].integrity;
 const lockWithoutIntegrityRejected=rejected('missing dependency integrity',/missing\/invalid integrity/,()=>validators.validateLock(dependencyLock));

 const wrongPackage=structuredClone(pkg);wrongPackage.name='@umf/not-core';
 const wrongInstalledIdentityRejected=rejected('wrong installed package identity',/installed package name/,()=>validators.validateIdentity(wrongPackage,lock,installedRoot,consumerRoot,archivePath,archiveIntegrity));
 const wrongArchiveLock=structuredClone(lock);wrongArchiveLock.packages['node_modules/@umf/core'].integrity='sha512-invalid';
 const wrongArchiveIdentityRejected=rejected('wrong archive identity',/lock archive integrity/,()=>validators.validateIdentity(pkg,wrongArchiveLock,installedRoot,consumerRoot,archivePath,archiveIntegrity));

 const wrongDefaultPackage=structuredClone(pkg);wrongDefaultPackage.exports['.'].node='./dist/wrong.js';
 const wrongDefaultRouteRejected=rejected('wrong default export route',/Node default export route/,()=>validators.validateIdentity(wrongDefaultPackage,lock,installedRoot,consumerRoot,archivePath,archiveIntegrity));
 const runtime=Object.keys(routes)[0];assert(runtime,'negative control requires a resolved runtime');
 const wrongResolvedRoutes=structuredClone(routes);wrongResolvedRoutes[runtime].root=`file:///tmp/wrong-installed-package/dist/umf-node.js`;
 const wrongResolvedDefaultRouteRejected=rejected('wrong resolved default route',/escaped installed package/,()=>validators.validateRouteResolution(wrongResolvedRoutes,installedRoot));
 return {lockWithoutIntegrityRejected,wrongInstalledIdentityRejected,wrongArchiveIdentityRejected,wrongDefaultRouteRejected,wrongResolvedDefaultRouteRejected};
}

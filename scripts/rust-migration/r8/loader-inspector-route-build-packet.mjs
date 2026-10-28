import {createHash} from 'node:crypto';
import {copyFile,mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {openArtifact,parseReplayOptions,fail} from './schema-graph-route-common.mjs';
import {validatePacket,validateClaims,CASES} from './loader-inspector-route-evidence.mjs';
const options=parseReplayOptions();
if(!options.output||!options['host-receipt']||!options['chromium-receipt'])fail('Pass --output, --host-receipt, and --chromium-receipt');
const scriptDir=dirname(fileURLToPath(import.meta.url));
const packetDir=resolve(options.output);
const root=resolve(scriptDir,'../../..');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canon=v=>JSON.stringify(v,(k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(n=>[n,x[n]])):x);
const artifact=await openArtifact(options,{requireBrowser:true});
try{
 const existing=await readdir(packetDir).catch(()=>[]);if(existing.length)fail('Packet output directory must be empty');await mkdir(packetDir,{recursive:true});
 const h=JSON.parse(await readFile(resolve(options['host-receipt']),'utf8'));
 const c=JSON.parse(await readFile(resolve(options['chromium-receipt']),'utf8'));
 if(h.status!=='pass'||!h.nodeBunExactReceiptParity||c.status!=='pass')fail('Private route receipts must pass before packet construction');
 const archivePath=resolve(options.input),archiveBytes=await readFile(archivePath);
 const tarMembers=execFileSync('tar',['-tzf',archivePath],{encoding:'utf8',maxBuffer:16*1024*1024}).split(/\r?\n/).filter(Boolean);
 const packageManifestBytes=await readFile(join(artifact.packageRoot,'manifest.json'));
 const sdkManifestBytes=await readFile(join(artifact.dist,'rust-default-manifest.json'));
 const packageJsonBytes=await readFile(join(artifact.packageRoot,'package.json'));
 const packageManifest=JSON.parse(packageManifestBytes.toString('utf8'));
 const packageJson=JSON.parse(packageJsonBytes.toString('utf8'));
 const packageMemberNames=new Set(tarMembers.map(name=>{if(!name.startsWith('package/')||name.endsWith('/')||name.split('/').includes('..'))fail(`Unsafe archive member: ${name}`);return name.slice('package/'.length);}));
 const expectedNames=new Set(['manifest.json',...Object.keys(packageManifest.sha256??{})]);
 if(canon([...packageMemberNames].sort())!==canon([...expectedNames].sort()))fail('Tar member set differs from embedded package manifest');
 const members={};for(const name of [...packageMemberNames].sort())members[name]=sha(await readFile(join(artifact.packageRoot,name)));
 for(const [name,expected] of Object.entries(packageManifest.sha256??{}))if(members[name]!==expected)fail(`Package member digest mismatch: ${name}`);
 if(members['manifest.json']!==sha(packageManifestBytes))fail('Package manifest digest mismatch');
 const sdk=artifact.manifest,sc=sdk.sourceClosure;
 const sourceInputs=sc.liveInputs;
 const liveDoc={format:'umf.r8.loader-inspector-live-source/1',sourceClosure:{sha256:sc.sha256,capturedLiveSha256:sc.capturedLiveSha256,fileCount:sc.fileCount,transform:sc.transform,inputs:Object.fromEntries(Object.entries(sourceInputs).sort(([a],[b])=>a.localeCompare(b)))}};
 await writeFile(join(packetDir,'live-source-manifest.json'),JSON.stringify(liveDoc,null,2)+'\n');
 const memberDoc={format:'umf.r8.loader-inspector-archive-members/1',status:'pass',algorithm:'sha256',archiveSha256:sha(archiveBytes),packageManifestSha256:members['manifest.json'],archiveMemberCount:tarMembers.length,verifiedMemberCount:tarMembers.length,totalArchiveMemberCount:tarMembers.length,members,scope:`Complete canonical archive map: all ${tarMembers.length-1} sidecar-pinned package members plus package/manifest.json.`};
 await writeFile(join(packetDir,'archive-members.json'),JSON.stringify(memberDoc,null,2)+'\n');
 await writeFile(join(packetDir,'archive-package-manifest.json'),packageManifestBytes);
 await writeFile(join(packetDir,'archive-sdk-manifest.json'),sdkManifestBytes);
 await writeFile(join(packetDir,'archive-package.json'),packageJsonBytes);
 const node={...h.receipts.node,runtime:{name:'Node',version:h.receipts.node.runtime}};
 const bun={...h.receipts.bun,runtime:{name:'Bun',version:h.receipts.bun.runtime}};
 const chromium=c;
 await writeFile(join(packetDir,'node.json'),JSON.stringify(node,null,2)+'\n');
 await writeFile(join(packetDir,'bun.json'),JSON.stringify(bun,null,2)+'\n');
 await writeFile(join(packetDir,'chromium.json'),JSON.stringify(chromium,null,2)+'\n');
 const harnessNames=['loader-inspector-host.mjs','loader-inspector-host-child.mjs','loader-inspector-chromium.mjs','loader-inspector-route-build-packet.mjs','loader-inspector-route-evidence.mjs','schema-graph-route-common.mjs'];
 for(const name of harnessNames)await copyFile(join(scriptDir,name),join(packetDir,name));
 const harnesses={};for(const name of harnessNames)harnesses[name]={path:name,sha256:sha(await readFile(join(packetDir,name)))};
 const liveBytes=await readFile(join(packetDir,'live-source-manifest.json')),memberBytes=await readFile(join(packetDir,'archive-members.json'));
 const receipt={format:'umf.r8.domain-pack-loader-inspection-route/1',status:'pass',operation:'inspectDomainPackLoader',referenceRoute:'./reference',operations:['inspectDomainPackLoader'],harnesses,sourceClosure:{sha256:sc.sha256,capturedLiveSha256:sc.capturedLiveSha256,fileCount:sc.fileCount,transform:sc.transform,liveSourceManifest:{path:'live-source-manifest.json',sha256:sha(liveBytes)}},archive:{status:'pass',path:relative(root,archivePath),sha256:sha(archiveBytes),bytes:archiveBytes.byteLength,verificationMethod:'packet-builder-read-archive-and-verified-all-members',manifestSha256:sha(sdkManifestBytes),packageManifestSha256:members['manifest.json'],sourceClosureSha256:packageManifest.sourceTreeSha256,capturedLiveSourceTreeSha256:packageManifest.capturedLiveSourceTreeSha256,sourceTransformStatus:packageManifest.sourceTransformStatus,sourceTransformCount:packageManifest.sourceTransformCount,memberManifest:{path:'archive-members.json',sha256:sha(memberBytes)},packageManifestFile:{path:'archive-package-manifest.json',sha256:sha(packageManifestBytes)},sdkManifestFile:{path:'archive-sdk-manifest.json',sha256:sha(sdkManifestBytes)},packageJsonFile:{path:'archive-package.json',sha256:sha(packageJsonBytes)},memberHashes:members},routes:{node:{path:'node.json',sha256:sha(await readFile(join(packetDir,'node.json')))},bun:{path:'bun.json',sha256:sha(await readFile(join(packetDir,'bun.json')))},chromium:{path:'chromium.json',sha256:sha(await readFile(join(packetDir,'chromium.json')))}},hostParity:h.nodeBunExactReceiptParity,evidenceSha256sums:{path:'SHA256SUMS'},qualification:{kind:'private-fixed-point-installed-route-evidence',logicalGapsOpen:922,logicalGapsRetired:0,releaseQualified:false,completeMigrationQualified:false}};
 const README=`# R8 installed route: inspectDomainPackLoader\n\nThis private packet records the installed Darwin arm64 archive route for CONTRACT-057 inspectDomainPackLoader. The packet builder read the exact archive, verified its complete ${tarMembers.length}-member map and package metadata, and pinned a zero-transform ${sc.fileCount}-input source closure. Node ${node.runtime.version} and Bun ${bun.runtime.version} each matched the explicit TypeScript reference across ${CASES.length} cases with eight direct native calls; wrapper-rejected accessor, toJSON, and cyclic inputs dispatched zero times. Chromium ${chromium.chromium.version} matched the same outcomes with eight directly observed WASM calls, requested the adjacent WASM, and recorded zero external requests and page errors.\n\nThe archive itself may remain in ignored build storage: validation needs no local archive bytes because the packet retains the archive SHA-256, complete member map, and pinned package manifests. This qualifies only the named private installed route and exact pinned cohort. The ledger remains at 922 open logical gaps and zero retirements. No ownership mapping or release qualification is claimed.\n`;
 await writeFile(join(packetDir,'README.md'),README);
 await writeFile(join(packetDir,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 const sumFiles=['README.md','receipt.json','live-source-manifest.json','archive-members.json','archive-package-manifest.json','archive-sdk-manifest.json','archive-package.json','node.json','bun.json','chromium.json',...harnessNames];
 const sums=[];for(const file of sumFiles)sums.push(`${sha(await readFile(join(packetDir,file)))}  ${file}`);
 await writeFile(join(packetDir,'SHA256SUMS'),sums.join('\n')+'\n');
 const claims={live:liveDoc,archiveMembers:memberDoc,packageManifest,sdkManifest:sdk,packageJson,node,bun,chromium};
 const validation=validateClaims(receipt,claims);if(validation.status!=='pass')fail(`Packet claims failed: ${validation.reason}`);
 const negativeCases=[
  ['stale source closure',r=>{r.sourceClosure.sha256='0'.repeat(64)}],
  ['archive member omission',r=>{delete r.archive.memberHashes['dist/umf-node.js']}],
  ['native dispatch undercount',(_r,m)=>{m.node.nativeDispatches=7}],
  ['native output tamper',(_r,m)=>{m.node.cases[0].nativeWireOutput='{"valid":false}'}],
  ['wrapper-rejected dispatch',(_r,m)=>{m.node.cases.find(x=>x.name==='accessor-refusal-no-evaluation').dispatches=1}],
  ['diagnostic order drift',(_r,m)=>{m.bun.cases.find(x=>x.name==='duplicate-and-incomplete-closure').result.diagnostics.reverse()}],
  ['WASM not requested',(_r,m)=>{m.chromium.chromium.wasmRequested=false}],
  ['WASM dispatch undercount',(_r,m)=>{m.chromium.chromium.wasmDispatches=7}],
  ['browser external request',(_r,m)=>{m.chromium.chromium.externalRequests=1}],
  ['browser page error',(_r,m)=>{m.chromium.chromium.pageErrors=1}],
  ['Node/Bun case divergence',(_r,m)=>{m.bun.cases[0].result.valid=false}],
 ];
 const negativeResults=[];for(const [name,mutate]of negativeCases){const r=structuredClone(receipt),m=structuredClone(claims);mutate(r,m);const output=validateClaims(r,m);if(output.status!=='fail')fail(`Negative control was accepted: ${name}`);negativeResults.push({name,rejected:true,reason:output.reason});}
 const controlDoc={format:'umf.r8.loader-inspector-negative-controls/1',status:'pass',baseline:validation,negativeControls:negativeResults};
 await writeFile(join(packetDir,'negative-controls.json'),JSON.stringify(controlDoc,null,2)+'\n');
 // Include the final negative-control document in the packet checksum set.
 const finalSums=[...sumFiles,'negative-controls.json'].map(async file=>`${sha(await readFile(join(packetDir,file)))}  ${file}`);
 await writeFile(join(packetDir,'SHA256SUMS'),(await Promise.all(finalSums)).join('\n')+'\n');
 const finalValidation=await validatePacket(receipt,packetDir,root);if(finalValidation.status!=='pass')fail(`Final packet validation failed: ${finalValidation.reason}`);
 process.stdout.write(JSON.stringify({status:'pass',packetDir,validation:finalValidation,negativeControls:negativeResults.length,archive:{sha256:receipt.archive.sha256,memberCount:tarMembers.length,packageManifestSha256:receipt.archive.packageManifestSha256},sourceClosure:{sha256:sc.sha256,fileCount:sc.fileCount},routes:{nodeCalls:node.nativeDispatches,bunCalls:bun.nativeDispatches,wasmCalls:chromium.chromium.wasmDispatches,chromium:chromium.chromium.version,externalRequests:chromium.chromium.externalRequests,pageErrors:chromium.chromium.pageErrors},files:['README.md','receipt.json','live-source-manifest.json','archive-members.json','node.json','bun.json','chromium.json','negative-controls.json','SHA256SUMS']})+'\n');
}finally{await artifact.cleanup();}

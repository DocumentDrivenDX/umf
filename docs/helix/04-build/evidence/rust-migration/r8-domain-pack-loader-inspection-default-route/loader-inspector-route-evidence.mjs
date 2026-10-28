import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import fs from 'node:fs';
import {resolve,relative,isAbsolute,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const HEX=/^[a-f0-9]{64}$/;
export const CASES=[
 {name:'valid',dispatch:1,result:{valid:true,complete:true,diagnostics:[]}},
 {name:'unknown-annotations-surrogates-and-depth',dispatch:1,result:{valid:true,complete:true,diagnostics:[]}},
 ...['unsupported-version','unsupported-id','unsupported-runtime','unsupported-profile','malformed-precedes-duplicate-and-closure'].map(name=>({name,dispatch:1,result:{valid:false,complete:false,diagnostics:['Unsupported or malformed loader companion']}})),
 {name:'duplicate-and-incomplete-closure',dispatch:1,result:{valid:false,complete:false,diagnostics:['Duplicate loader artifact','Incomplete loader artifact closure']}},
 ...['accessor-refusal-no-evaluation','toJSON-refusal-no-evaluation','cycle-refusal'].map(name=>({name,dispatch:0,result:{valid:false,complete:false,diagnostics:['Non-JSON loader companion']}})),
];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(name=>[name,item[name]])):item);
const safeRelative=value=>typeof value==='string'&&value.length>0&&!isAbsolute(value)&&!value.split(/[\\/]/).includes('..');
const ensure=(condition,message)=>{if(!condition)throw new Error(message);};
const inside=(root,path)=>{const abs=resolve(root,path),rel=relative(root,abs);return !rel.startsWith('..'+sep)&&!isAbsolute(rel);};
async function readPin(base,pin,label){ensure(pin&&safeRelative(pin.path)&&HEX.test(pin.sha256),`bad ${label} pin`);ensure(inside(base,pin.path),`${label} escaped packet root`);const bytes=await readFile(resolve(base,pin.path));ensure(sha(bytes)===pin.sha256,`${label} hash mismatch`);return {bytes,json:JSON.parse(bytes.toString('utf8')),path:pin.path};}
function caseShape(receipt,expectedCounterKey){ensure(receipt?.status==='pass',`${expectedCounterKey} receipt failed`);ensure(receipt.function?.name==='inspectDomainPackLoader'&&receipt.function?.arity===1,`${expectedCounterKey} public function shape mismatch`);ensure(Array.isArray(receipt.cases)&&receipt.cases.length===CASES.length,`${expectedCounterKey} fixture count mismatch`);let total=0;for(let index=0;index<CASES.length;index++){const actual=receipt.cases[index],expected=CASES[index];ensure(actual.name===expected.name,`${expectedCounterKey} fixture order/name mismatch`);ensure(canonical(actual.result)===canonical(expected.result),`${expectedCounterKey} ${expected.name} outcome mismatch`);const count=expectedCounterKey==='browser'?actual.wasmDispatches:actual.dispatches;ensure(count===expected.dispatch,`${expectedCounterKey} ${expected.name} dispatch mismatch`);total+=count;}return total;}
export function validateClaims(receipt,{live,archiveMembers,packageManifest,sdkManifest,packageJson,node,bun,chromium}){
 try{
  ensure(receipt?.format==='umf.r8.domain-pack-loader-inspection-route/1'&&receipt.status==='pass','receipt format/status mismatch');
  ensure(receipt.operation==='inspectDomainPackLoader'&&receipt.referenceRoute==='./reference'&&canonical(receipt.operations)===canonical(['inspectDomainPackLoader']),'operation/reference scope mismatch');
  const harnessNames=['loader-inspector-host.mjs','loader-inspector-host-child.mjs','loader-inspector-chromium.mjs','loader-inspector-route-build-packet.mjs','loader-inspector-route-evidence.mjs','schema-graph-route-common.mjs'];
  ensure(receipt.harnesses&&canonical(Object.keys(receipt.harnesses).sort())===canonical(harnessNames.slice().sort()),'pinned harness set is incomplete');
  for(const [name,pin] of Object.entries(receipt.harnesses))ensure(pin.path===name&&HEX.test(pin.sha256??''),`invalid harness pin ${name}`);
  const closure=receipt.sourceClosure,source=live?.sourceClosure;
  ensure(closure?.sha256===source?.sha256&&closure?.capturedLiveSha256===source?.capturedLiveSha256&&closure?.sha256===closure?.capturedLiveSha256,'source closure identity mismatch');
  ensure(closure.fileCount===source?.fileCount&&canonical(closure.transform)===canonical(source?.transform)&&source?.transform?.status==='fixed-point'&&source.transform.generatedInputs?.length===0&&Object.keys(source.inputs??{}).length===closure.fileCount,'source closure is not a complete zero-transform fixed point');
  const requiredSourceFiles=['src/index-node-v4.ts','src/index-browser-v4.ts','src/domain-packs/loader-rust.ts','src/domain-packs/loader.ts','src/model/json.ts','bindings/core/node/index.js','bindings/core/node/src/lib.rs','bindings/core/wasm/src/lib.rs','crates/umf-core/src/domain_pack_loader_inspection.rs','bindings/core/node/tests/domain-pack-loader-inspection.test.js',...harnessNames.map(name=>`scripts/rust-migration/r8/${name}`)];
  ensure(requiredSourceFiles.every(name=>HEX.test(source.inputs?.[name]??'')), 'loader inspection source closure omits a required route or owner file');
  for(const [name,pin] of Object.entries(receipt.harnesses))ensure(source.inputs[`scripts/rust-migration/r8/${name}`]===pin.sha256,`pinned harness ${name} differs from the fixed-point source closure`);
  const archive=receipt.archive,members=archiveMembers;
  ensure(safeRelative(archive?.path)&&safeRelative(receipt.sourceClosure?.liveSourceManifest?.path)&&safeRelative(archive?.memberManifest?.path),'unsafe archive/source evidence path');
  ensure(['node','bun','chromium'].every(key=>safeRelative(receipt.routes?.[key]?.path)&&HEX.test(receipt.routes?.[key]?.sha256??'')),'route receipt pins are incomplete');
  ensure(archive?.status==='pass'&&HEX.test(archive.sha256??'')&&HEX.test(archive.packageManifestSha256??'')&&archive.verificationMethod==='packet-builder-read-archive-and-verified-all-members','archive pin or byte-verification provenance missing');
  ensure(members?.status==='pass'&&members.algorithm==='sha256'&&members.archiveSha256===archive.sha256&&members.packageManifestSha256===archive.packageManifestSha256,'archive member manifest identity mismatch');
  ensure(Number.isSafeInteger(members.archiveMemberCount)&&members.archiveMemberCount>0&&members.verifiedMemberCount===members.archiveMemberCount&&Object.keys(members.members??{}).length===members.archiveMemberCount,'archive member inventory incomplete');
  ensure(members.members['manifest.json']===archive.packageManifestSha256,'package manifest member hash mismatch');
  ensure(archive.memberHashes?.['manifest.json']===members.members['manifest.json']&&canonical(archive.memberHashes)===canonical(members.members),'receipt/member maps differ');
  ensure(archive.manifestSha256===members.members['dist/rust-default-manifest.json'],'SDK manifest pin mismatch');
  ensure(receipt.archive.packageManifestFile?.sha256===archive.packageManifestSha256&&receipt.archive.sdkManifestFile?.sha256===archive.manifestSha256&&receipt.archive.packageJsonFile?.sha256===members.members['package.json'],'package metadata file pins do not match archive members');
  ensure(packageManifest?.sourceTreeSha256===closure.sha256&&packageManifest?.capturedLiveSourceTreeSha256===closure.capturedLiveSha256&&packageManifest?.sourceTransformStatus==='fixed-point'&&packageManifest?.sourceTransformCount===0,'package manifest source binding mismatch');
  ensure(canonical(packageManifest.sha256??{})===canonical(Object.fromEntries(Object.entries(members.members).filter(([name])=>name!=='manifest.json'))),'package manifest member map mismatch');
  ensure(sdkManifest?.sourceClosure?.sha256===closure.sha256&&sdkManifest?.sourceClosure?.capturedLiveSha256===closure.capturedLiveSha256&&sdkManifest.sourceClosure.transform?.status==='fixed-point'&&sdkManifest.sourceClosure.transform.generatedInputs?.length===0&&canonical(sdkManifest.sourceClosure.liveInputs)===canonical(source.inputs),'SDK source manifest mismatch');
  ensure(packageJson?.exports&&canonical(packageJson.exports['.']?.node??packageJson.exports['.'])===canonical('./dist/umf-node.js')&&canonical(packageJson.exports['.']?.browser)===canonical('./dist/umf-browser.js')&&canonical(packageJson.exports['./reference']?.import)===canonical('./dist/umf.js'),'package route export metadata mismatch');
  ensure(archive.sourceClosureSha256===closure.sha256&&archive.capturedLiveSourceTreeSha256===closure.capturedLiveSha256&&archive.sourceTransformStatus==='fixed-point'&&archive.sourceTransformCount===0,'archive source binding mismatch');
  const required=['manifest.json','package.json','dist/rust-default-manifest.json','dist/umf-node.js','dist/umf-browser.js','dist/umf.js','dist/umf_core_node.node','dist/umf_core_wasm_bg.wasm'];
  ensure(required.every(name=>HEX.test(members.members?.[name]??'')),'required SDK archive member missing');
  ensure(node?.runtime?.name==='Node'&&bun?.runtime?.name==='Bun','Node/Bun runtime identity missing');
  ensure(node.runtime.version&&bun.runtime.version,'Node/Bun version missing');
  const nTotal=caseShape(node,'node'),bTotal=caseShape(bun,'bun');
  ensure(nTotal===8&&bTotal===8&&node.nativeDispatches===8&&node.expectedNativeDispatches===8&&bun.nativeDispatches===8&&bun.expectedNativeDispatches===8,'native dispatch total mismatch');
  ensure(node.accessorInvoked===0&&node.toJsonInvoked===0&&bun.accessorInvoked===0&&bun.toJsonInvoked===0,'host wrapper evaluated accessor/toJSON');
  for(const [label,host] of [['Node',node],['Bun',bun]])for(let i=0;i<CASES.length;i++){const row=host.cases[i];if(CASES[i].dispatch){ensure(typeof row.nativeWireInput==='string'&&typeof row.nativeWireOutput==='string'&&HEX.test(row.nativeWireInputSha256??'')&&HEX.test(row.nativeOutputSha256??''),`${label} direct native wire/result capture missing`);ensure(sha(Buffer.from(row.nativeWireInput))===row.nativeWireInputSha256&&sha(Buffer.from(row.nativeWireOutput))===row.nativeOutputSha256,`${label} native wire/result digest mismatch`);let nativeResult;try{nativeResult=JSON.parse(row.nativeWireOutput);JSON.parse(row.nativeWireInput);}catch{ensure(false,`${label} native wire/result is malformed JSON`);}ensure(canonical(nativeResult)===canonical(row.result),`${label} direct native result differs from the public result`);}else ensure(row.nativeWireInputSha256===null&&row.nativeOutputSha256===null&&row.nativeWireInput===null&&row.nativeWireOutput===null,`${label} non-JSON case unexpectedly has a native result`);}
  ensure(Array.isArray(node.wireInputs)&&node.wireInputs.length===8&&node.wireInputs.every(x=>Number.isSafeInteger(x.bytes)&&x.bytes>0&&HEX.test(x.sha256)),'native wire inputs are not completely pinned');
  for(const [label,host] of [['Node',node],['Bun',bun]]){const dispatched=host.cases.filter(row=>row.dispatches===1).map(row=>row.nativeWireInputSha256);ensure(canonical(host.wireInputs.map(row=>row.sha256))===canonical(dispatched),`${label} wire-input hash sequence differs from case evidence`);}
  ensure(canonical(node.cases)===canonical(bun.cases), 'Node/Bun case results/wire hashes differ');
  ensure(receipt.hostParity===true,'Node/Bun exact parity not recorded');
  ensure(chromium?.status==='pass'&&chromium.chromium?.version&&chromium.chromium.function?.name==='inspectDomainPackLoader'&&chromium.chromium.function?.arity===1,'Chromium public route receipt incomplete');
  ensure(chromium.chromium.wasmExport==='inspectDomainPackLoaderWire'&&chromium.chromium.wasmExportSeen===true&&chromium.chromium.wasmDispatches===8&&chromium.chromium.expectedDispatches===8,'WASM dispatch evidence mismatch');
  ensure(chromium.chromium.wasmRequested===true&&chromium.chromium.externalRequests===0&&chromium.chromium.pageErrors===0&&chromium.chromium.nodeGlobalsAbsent===true&&chromium.chromium.requireAbsent===true,'Chromium environment or request controls failed');
  const cTotal=caseShape(chromium.chromium,'browser');ensure(cTotal===8,'WASM per-case dispatch total mismatch');
  ensure(canonical(chromium.chromium.cases.map(x=>({name:x.name,result:x.result,dispatches:x.wasmDispatches})))===canonical(node.cases.map(x=>({name:x.name,result:x.result,dispatches:x.dispatches}))), 'Chromium/Node case results differ');
  ensure(receipt.qualification?.releaseQualified===false&&receipt.qualification?.logicalGapsRetired===0&&receipt.qualification?.logicalGapsOpen===922,'qualification scope overclaim');
  return {status:'pass'};
 }catch(error){return {status:'fail',reason:String(error?.message??error).slice(0,400)};}
}
export async function validatePacket(receipt,packetDir,repositoryRoot){
 try{
  const sumsPath=receipt?.evidenceSha256sums?.path;ensure(safeRelative(sumsPath)&&inside(packetDir,sumsPath),'unsafe checksum file path');
  const recordedReceipt=JSON.parse(await readFile(resolve(packetDir,'receipt.json'),'utf8'));
  ensure(canonical(recordedReceipt)===canonical(receipt),'supplied receipt differs from pinned receipt file');
  const sumsBytes=await readFile(resolve(packetDir,sumsPath));const lines=sumsBytes.toString('utf8').split(/\r?\n/).filter(Boolean);const entries=new Map();for(const line of lines){const m=/^([a-f0-9]{64})  (.+)$/.exec(line);ensure(m&&safeRelative(m[2]),'malformed checksum row');ensure(!entries.has(m[2]),'duplicate checksum entry');entries.set(m[2],m[1]);}
  ensure(entries.has('README.md')&&entries.has('receipt.json'),'checksum list omits README or receipt');
  for(const [path,expected] of entries){ensure(inside(packetDir,path),'checksum path escaped packet');ensure(sha(await readFile(resolve(packetDir,path)))===expected,`checksum mismatch: ${path}`);}
  const readEvidence=async(pin,label)=>{const item=await readPin(packetDir,pin,label);ensure(entries.has(pin.path)&&entries.get(pin.path)===pin.sha256,`${label} is not in checksum list`);return item;};
  const negativeBytes=await readFile(resolve(packetDir,'negative-controls.json'));
  ensure(entries.has('negative-controls.json')&&sha(negativeBytes)===entries.get('negative-controls.json'),'negative controls are not checksum-pinned');
  const negativeControls=JSON.parse(negativeBytes.toString('utf8'));
  const expectedNegativeNames=['stale source closure','archive member omission','native dispatch undercount','native output tamper','wrapper-rejected dispatch','diagnostic order drift','WASM not requested','WASM dispatch undercount','browser external request','browser page error','Node/Bun case divergence'];
  ensure(negativeControls.format==='umf.r8.loader-inspector-negative-controls/1'&&negativeControls.status==='pass'&&negativeControls.baseline?.status==='pass','negative control report is incomplete');
  ensure(canonical(negativeControls.negativeControls?.map(control=>control.name))===canonical(expectedNegativeNames)&&negativeControls.negativeControls.every(control=>control.rejected===true&&typeof control.reason==='string'&&control.reason.length>0),'negative control rejection set is incomplete');
  const live=await readEvidence(receipt.sourceClosure?.liveSourceManifest,'live source manifest');const members=await readEvidence(receipt.archive?.memberManifest,'archive member map');
  const packageManifest=await readEvidence(receipt.archive?.packageManifestFile,'archive package manifest');const sdkManifest=await readEvidence(receipt.archive?.sdkManifestFile,'archive SDK manifest');const packageJson=await readEvidence(receipt.archive?.packageJsonFile,'archive package.json');
  const node=await readEvidence(receipt.routes?.node,'Node receipt');const bun=await readEvidence(receipt.routes?.bun,'Bun receipt');const chromium=await readEvidence(receipt.routes?.chromium,'Chromium receipt');
  for(const [name,pin] of Object.entries(receipt.harnesses)){ensure(safeRelative(pin.path)&&inside(packetDir,pin.path)&&entries.get(pin.path)===pin.sha256,`harness ${name} is not checksum-pinned`);ensure(sha(await readFile(resolve(packetDir,pin.path)))===pin.sha256,`harness ${name} hash mismatch`);}
  for(const key of Object.keys(live.json.sourceClosure.inputs)){ensure(safeRelative(key)&&inside(repositoryRoot,key),`unsafe source path ${key}`);const bytes=await readFile(resolve(repositoryRoot,key));ensure(sha(bytes)===live.json.sourceClosure.inputs[key],`current source drift ${key}`);}
  const tree=createHash('sha256');for(const key of Object.keys(live.json.sourceClosure.inputs).sort()){tree.update(key);tree.update('\0');tree.update(await readFile(resolve(repositoryRoot,key)));tree.update('\0');}ensure(tree.digest('hex')===receipt.sourceClosure.sha256,'recomputed live source tree mismatch');
  const packageMetadata=[packageManifest.json,sdkManifest.json,packageJson.json];ensure(members.json.archiveMemberCount===members.json.verifiedMemberCount&&members.json.members['manifest.json']===receipt.archive.packageManifestSha256,'archive member inventory incomplete');
  for(const [member,expected] of Object.entries(members.json.members))ensure(HEX.test(expected),`invalid archived member digest ${member}`);
  const target=(value,condition)=>{const selected=typeof value==='string'?value:value?.[condition]??value?.import;return typeof selected==='string'?selected.replace(/^\.\//,''):null;};
  ensure(target(packageMetadata[2].exports?.['.'],'node')==='dist/umf-node.js'&&target(packageMetadata[2].exports?.['.'],'browser')==='dist/umf-browser.js'&&target(packageMetadata[2].exports?.['./reference'],'import')==='dist/umf.js','package route export mismatch');
  const claim=validateClaims(receipt,{live:live.json,archiveMembers:members.json,packageManifest:packageMetadata[0],sdkManifest:packageMetadata[1],packageJson:packageMetadata[2],node:node.json,bun:bun.json,chromium:chromium.json});ensure(claim.status==='pass',claim.reason);
  ensure(live.json.sourceClosure.sha256===receipt.sourceClosure.sha256,'live manifest closure mismatch');
  return {status:'pass',sourceInputs:receipt.sourceClosure.fileCount,archiveMembers:members.json.archiveMemberCount,cases:CASES.length,archiveBytesReopened:false,archiveVerification:'captured full-member map and pinned package manifests; archive bytes were verified by the packet builder'};
 }catch(error){return {status:'fail',reason:String(error?.message??error).slice(0,500)};}
}
export function validatePacketSync(receipt,packetDir,repositoryRoot){
 try{
  const readJson=(base,pin,label)=>{ensure(pin&&safeRelative(pin.path)&&HEX.test(pin.sha256??''),`bad ${label} pin`);ensure(inside(base,pin.path),`${label} escaped its root`);const bytes=fs.readFileSync(resolve(base,pin.path));ensure(sha(bytes)===pin.sha256,`${label} hash mismatch`);return {bytes,json:JSON.parse(bytes.toString('utf8'))};};
  const sumsPath=receipt?.evidenceSha256sums?.path;ensure(safeRelative(sumsPath)&&inside(packetDir,sumsPath),'unsafe checksum path');
  ensure(canonical(JSON.parse(fs.readFileSync(join(packetDir,'receipt.json'),'utf8')))===canonical(receipt),'receipt differs from pinned receipt file');
  const rows=fs.readFileSync(resolve(packetDir,sumsPath),'utf8').split(/\r?\n/).filter(Boolean).map(line=>{const m=/^([a-f0-9]{64})  (.+)$/.exec(line);ensure(m&&safeRelative(m[2]),'malformed checksum row');return [m[2],m[1]];});
  const sums=new Map(rows);ensure(sums.size===rows.length&&sums.has('README.md')&&sums.has('receipt.json'),'checksum inventory is incomplete or duplicated');
  for(const [name,expected] of sums){ensure(inside(packetDir,name),`checksum path escaped packet: ${name}`);ensure(sha(fs.readFileSync(resolve(packetDir,name)))===expected,`checksum mismatch: ${name}`);}
  const requirePin=(pin,label)=>{const value=readJson(packetDir,pin,label);ensure(sums.get(pin.path)===pin.sha256,`${label} is not checksum-pinned`);return value;};
  ensure(sums.has('negative-controls.json'),'negative controls are absent from checksum inventory');
  const negativeBytes=fs.readFileSync(resolve(packetDir,'negative-controls.json'));ensure(sha(negativeBytes)===sums.get('negative-controls.json'),'negative controls checksum mismatch');
  const negativeControls=JSON.parse(negativeBytes.toString('utf8'));
  const expectedNegativeNames=['stale source closure','archive member omission','native dispatch undercount','native output tamper','wrapper-rejected dispatch','diagnostic order drift','WASM not requested','WASM dispatch undercount','browser external request','browser page error','Node/Bun case divergence'];
  ensure(negativeControls.format==='umf.r8.loader-inspector-negative-controls/1'&&negativeControls.status==='pass'&&negativeControls.baseline?.status==='pass','negative control report is incomplete');
  ensure(canonical(negativeControls.negativeControls?.map(control=>control.name))===canonical(expectedNegativeNames)&&negativeControls.negativeControls.every(control=>control.rejected===true&&typeof control.reason==='string'&&control.reason.length>0),'negative control rejection set is incomplete');
  const live=requirePin(receipt.sourceClosure?.liveSourceManifest,'live source manifest');
  const members=requirePin(receipt.archive?.memberManifest,'archive member map');
  const packageManifest=requirePin(receipt.archive?.packageManifestFile,'archive package manifest');const sdkManifest=requirePin(receipt.archive?.sdkManifestFile,'archive SDK manifest');const packageJson=requirePin(receipt.archive?.packageJsonFile,'archive package.json');
  const node=requirePin(receipt.routes?.node,'Node receipt');const bun=requirePin(receipt.routes?.bun,'Bun receipt');const chromium=requirePin(receipt.routes?.chromium,'Chromium receipt');
  for(const [name,pin] of Object.entries(receipt.harnesses??{})){ensure(safeRelative(pin.path)&&inside(packetDir,pin.path)&&sums.get(pin.path)===pin.sha256,`harness ${name} is not checksum-pinned`);ensure(sha(fs.readFileSync(resolve(packetDir,pin.path)))===pin.sha256,`harness ${name} hash mismatch`);}
  const source=live.json.sourceClosure;ensure(source?.sha256===receipt.sourceClosure?.sha256&&source?.capturedLiveSha256===receipt.sourceClosure?.capturedLiveSha256&&source.sha256===source.capturedLiveSha256&&source.fileCount===receipt.sourceClosure.fileCount&&source.transform?.status==='fixed-point'&&source.transform.generatedInputs?.length===0&&Object.keys(source.inputs??{}).length===source.fileCount,'source closure is not a complete fixed point');
  const tree=createHash('sha256');for(const name of Object.keys(source.inputs).sort()){ensure(safeRelative(name)&&inside(repositoryRoot,name),`unsafe source path ${name}`);const bytes=fs.readFileSync(resolve(repositoryRoot,name));ensure(sha(bytes)===source.inputs[name],`current source drift ${name}`);tree.update(name);tree.update('\0');tree.update(bytes);tree.update('\0');}ensure(tree.digest('hex')===receipt.sourceClosure.sha256,'recomputed current source closure mismatch');
  ensure(members.json.archiveMemberCount===members.json.verifiedMemberCount&&members.json.members['manifest.json']===receipt.archive.packageManifestSha256,'archive member inventory incomplete');for(const [name,expected] of Object.entries(members.json.members??{}))ensure(HEX.test(expected),`invalid archive member digest ${name}`);
  const archivePath=receipt.archive?.path;ensure(safeRelative(archivePath)&&inside(repositoryRoot,archivePath),'unsafe archive identity path');
  ensure(sha(packageManifest.bytes)===receipt.archive.packageManifestSha256&&members.json.members['manifest.json']===receipt.archive.packageManifestSha256&&canonical(Object.fromEntries(Object.entries(members.json.members).filter(([name])=>name!=='manifest.json')))===canonical(packageManifest.json.sha256??{}),'archive package manifest differs from member map');
  ensure(sha(sdkManifest.bytes)===receipt.archive.manifestSha256&&members.json.members['dist/rust-default-manifest.json']===receipt.archive.manifestSha256,'SDK manifest hash mismatch');
  ensure(sha(packageJson.bytes)===members.json.members['package.json'],'package.json hash mismatch');
  const claim=validateClaims(receipt,{live:live.json,archiveMembers:members.json,packageManifest:packageManifest.json,sdkManifest:sdkManifest.json,packageJson:packageJson.json,node:node.json,bun:bun.json,chromium:chromium.json});ensure(claim.status==='pass',claim.reason);return {status:'pass',archiveBytesReopened:false,archiveVerification:'captured full-member map and pinned package manifests; archive bytes were verified by the packet builder'};
 }catch(error){return {status:'fail',reason:String(error?.message??error).slice(0,500)};}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const [packetDir,repositoryRoot]=process.argv.slice(2);if(!packetDir||!repositoryRoot){process.stderr.write('Usage: node packet-validator.mjs <packet-directory> <repository-root>\n');process.exitCode=2;}else{
  let receipt;try{receipt=JSON.parse(await readFile(resolve(packetDir,'receipt.json'),'utf8'));}catch(error){process.stderr.write(`Cannot read receipt: ${error.message}\n`);process.exitCode=1;}
  if(receipt){const result=await validatePacket(receipt,resolve(packetDir),resolve(repositoryRoot));process.stdout.write(JSON.stringify(result)+'\n');if(result.status!=='pass')process.exitCode=1;}
 }
}

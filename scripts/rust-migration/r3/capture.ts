// SPDX-License-Identifier: MIT OR Apache-2.0
/** Capture frozen TypeScript oracle envelopes for R3. */
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import '../../codegen/entry';
import {generatePythonClient} from '../../../src/access';
import {compileTableDeployment,verifyTableDeployment} from '../../../src/table-deployment';
import {compileTableMigration,verifyTableMigration,discoverTableMigrationChanges} from '../../../src/table-migration';
import {generateAccessPackage} from '../../../src/compilation/index';
import {admitAccessRequest} from '../../../src/compilation/admission/index';
import {emitPythonAccess} from '../../../src/compilation/targets/python/index';
import {hashCanonical,sha256Text} from '../../../src/compilation/bundle/index';
import {diffAccessPackages} from '../../../src/compilation/admission/index';
import {profile,request,mutateSource} from '../../../tests/compilation/access-fixtures';
import searchModel from '../../../fixtures/access/search/model.json';

const root=resolve(import.meta.dir,'../../..'),out=resolve(root,'docs/helix/04-build/evidence/rust-migration/r3/baseline'),scratch='/private/tmp/umf-r3-baseline-capture';
const sha=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex'),cmp=(a:string,b:string)=>a<b?-1:a>b?1:0;
type Case={id:string;operation:string;request:unknown;expected:unknown;inputSha256:string;resultSha256:string};const cases:Case[]=[];
const wrappers:Record<string,(input:string)=>string>={generatePythonClient:(globalThis as any).__umf_codegen,compileTableDeployment:(globalThis as any).__umf_table_deploy,verifyTableDeployment:(globalThis as any).__umf_table_verify,compileTableMigration:(globalThis as any).__umf_table_migrate,verifyTableMigration:(globalThis as any).__umf_table_migration_verify,discoverTableMigrationChanges:(globalThis as any).__umf_table_migration_changes,normalizeRowScope:(globalThis as any).__umf_row_scope};
function add(id:string,operation:string,req:unknown,_oracle?:()=>unknown){const fn=wrappers[operation];if(!fn)throw Error(`No oracle wrapper: ${operation}`);const expected=JSON.parse(fn(JSON.stringify(req)));const text=JSON.stringify(req);cases.push({id,operation,request:req,expected,inputSha256:sha(text),resultSha256:sha(JSON.stringify(expected))});}
async function corpus(script:string,name:string){const path=`${scratch}/${name}.json`,r=spawnSync('bun',[resolve(root,script),path],{cwd:root,encoding:'utf8'});if(r.status!==0)throw Error(`${script}: ${r.stderr}`);return JSON.parse(await readFile(path,'utf8'));}
await rm(scratch,{recursive:true,force:true});await mkdir(scratch,{recursive:true});
for(const c of await corpus('scripts/codegen-corpus.ts','clients'))add(`client/${c.name}`,'generatePythonClient',c.request);
const deployments=await corpus('scripts/table-deployment-corpus.ts','deployments'),deploymentResults:any[]=[];
for(const c of deployments){add(`deployment/${c.name}`,'compileTableDeployment',c.request);deploymentResults.push({name:c.name,result:compileTableDeployment(c.request)});}
for(const {name,result} of deploymentResults)if(result.status==='compiled'){const bundle=result.bundle;add(`deployment-verify/${name}`,'verifyTableDeployment',{bundle});const bad=structuredClone(bundle);bad.bundleDigest='0'.repeat(64);add(`deployment-verify-refusal/${name}`,'verifyTableDeployment',{bundle:bad});const selfSigned=structuredClone(bundle);selfSigned.expectedCatalog.tables[0].name+='tampered';const {bundleDigest,...body}=selfSigned;selfSigned.bundleDigest=hashCanonical(body);add(`deployment-verify-self-signed-tamper/${name}`,'verifyTableDeployment',{bundle:selfSigned});}
add('deployment-verify-malformed','verifyTableDeployment',{bundle:{}});add('deployment-verify-wrong-key','verifyTableDeployment',{unexpected:{}});add('deployment-malformed-request','compileTableDeployment',{});
const migrations=await corpus('scripts/table-migration-corpus.ts','migrations'),migrationResults:any[]=[];
for(const c of migrations){add(`migration/${c.name}`,'compileTableMigration',c.request);migrationResults.push({name:c.name,result:compileTableMigration(c.request)});}
for(const {name,result} of migrationResults)if(result.status==='compiled'){const plan=result.plan;add(`migration-verify/${name}`,'verifyTableMigration',{plan});const bad=structuredClone(plan);if(bad.steps?.length)bad.steps[0].sql=(bad.steps[0].sql??'')+' -- altered';else bad.digest='0'.repeat(64);add(`migration-verify-refusal/${name}`,'verifyTableMigration',{plan:bad});const selfSigned=structuredClone(plan);if(selfSigned.steps?.length)selfSigned.steps[0].sql=(selfSigned.steps[0].sql??'')+' -- altered';const {digest,...body}=selfSigned;selfSigned.digest=hashCanonical(body);add(`migration-verify-self-signed-tamper/${name}`,'verifyTableMigration',{plan:selfSigned});}
add('migration-verify-malformed','verifyTableMigration',{plan:{}});add('migration-verify-wrong-key','verifyTableMigration',{unexpected:{}});add('migration-malformed-request','compileTableMigration',{});
const validBundles=deploymentResults.filter(x=>x.result.status==='compiled').map(x=>x.result.bundle);
for(let i=0;i+1<validBundles.length;i++){const req={previous:validBundles[i],next:validBundles[i+1]};add(`changes/pair-${i}`,'discoverTableMigrationChanges',req,()=>({changes:discoverTableMigrationChanges(verifyTableDeployment(req.previous),verifyTableDeployment(req.next))}));}
if(validBundles.length){const req={previous:validBundles[0],next:validBundles[0],extra:true};add('changes/extra-member-refusal','discoverTableMigrationChanges',req);}
add('changes-malformed-request','discoverTableMigrationChanges',{});add('changes-malformed-bundle','discoverTableMigrationChanges',{previous:{},next:{}});
for(const c of await corpus('scripts/row-scope-codegen-corpus.ts','row-scope')){const req={input:c.input,context:c.context};add(`row-scope/${c.id}`,'normalizeRowScope',req);}
add('row-scope-malformed-request','normalizeRowScope',{});
add('client-malformed-request','generatePythonClient',{});

// Stage one has a separate admitted-IR, emission, bundle, and hash corpus.
const baseReq=request(),baseProfile=profile(),stageInputs:any[]=[{id:'candidate-base',request:baseReq,profile:baseProfile}];
function stage(id:string,req:any,prof:any=structuredClone(baseProfile)){stageInputs.push({id,request:req,profile:prof});}
let q=structuredClone(baseReq);q.mode='report';stage('report-mode',q);
q=structuredClone(baseReq);q.sources[0]!.text+='\n';stage('source-digest-whitespace',q);
const profileDigestChange=structuredClone(baseProfile);profileDigestChange.subset+=' changed';stage('profile-digest-change',structuredClone(baseReq),profileDigestChange);
q=structuredClone(baseReq);mutateSource(q,(d:any)=>Object.assign(d.modules[0].elements.find((e:any)=>e.id==='Order'),{futureR3:{opaque:[1,'x']}}));stage('unknown-selected-refusal',q);
q=structuredClone(baseReq);mutateSource(q,(d:any)=>{d.modules[0].elements.push({id:'futureRecord',kind:'record',members:[],extensions:{'future.extension':{opaque:'retained'}}});Object.assign(d.vocabularies,{'future.extension':{version:'1.0.0'}});});stage('unselected-unknown-preserved',q);
q=structuredClone(baseReq);mutateSource(q,(d:any)=>{d.title='Unicode café 東京 😀';});stage('unicode-source',q);
q=structuredClone(baseReq);q.names=[{sourceId:'logical',pointer:'/modules/0/elements/0',python:'stable_identity'}];stage('explicit-names',q);
q=structuredClone(baseReq);q.projections=[{name:'orderSummary',record:q.records[0]!,fields:[{module:'commerce',element:'orderId'},{module:'commerce',element:'amount'}]}];stage('projection',q);
q=structuredClone(baseReq);mutateSource(q,(d:any)=>Object.assign(d.modules[0],{relationships:[{id:'customer',name:'Order customer',source:[{module:'commerce',element:'Order'}],target:[{module:'commerce',element:'Customer',key:'Customer-key'}],sourceMultiplicity:{min:0,max:'*'},targetMultiplicity:{min:0,max:1},targetLifecycle:'independent',directed:true}]}));stage('relationship-closure',q);
q=structuredClone(baseReq);mutateSource(q,(d:any)=>d.modules[0].elements.find((e:any)=>e.id==='Order').keys.push({id:'revision-key',name:'Revision identity',fields:[{module:'commerce',element:'revision'}],primary:false}));stage('alternate-key',q);
q=structuredClone(baseReq);const actionDoc=JSON.parse(await readFile(resolve(root,'fixtures/access/commerce/actions.json'),'utf8'));q.sources=[{id:'logical',format:'json',text:JSON.stringify(actionDoc)}];q.actions=[{module:'commerce',action:'shipOrder'}];stage('typed-action',q);
q=structuredClone(baseReq);const searchDoc=structuredClone(searchModel);q.sources=[{id:'logical',format:'json',text:JSON.stringify(searchDoc)}];q.records=[{module:'search',element:'Doc'}];q.package='search_docs';stage('search-index',q);
q=structuredClone(baseReq);mutateSource(q,(d:any)=>{d.modules[0].extensions['umf.access'].views=[];});stage('missing-view-refusal',q);
q=structuredClone(baseReq);for(let i=1;i<33;i++)q.sources.push({id:`extra${i}`,format:'json',text:q.sources[0]!.text});stage('source-count-limit',q);
stage('request-shape-refusal',{});
const badProfile=structuredClone(baseProfile);badProfile.codeSha256='prefix'+badProfile.codeSha256;stage('profile-shape-refusal',structuredClone(baseReq),badProfile);
const vectors=stageInputs.map(v=>{
 let result:any=null,expected:any;try{result=generateAccessPackage(v.request,v.profile);expected={ok:true,result};}catch(e){const z=e as any;expected={ok:false,error:{code:z.code??'GENERATION_FAILED',message:z.message??String(e),...(z.pointer===undefined?{}:{pointer:z.pointer})}};}let admission:any=null,emission:any=null;
 try{admission=admitAccessRequest(v.request,v.profile);if(!admission.diagnostics.length){const logical=admission.request.sources.find((s:any)=>s.id===admission.request.logical)!;const runtime=admission.profile.dependencies.find((d:any)=>['umf_access','umf-access'].includes(d.distribution))!.version;const inputDigest=hashCanonical({request:admission.request,profile:admission.profile});emission=emitPythonAccess(admission.ir,admission.request,inputDigest,sha256Text(logical.text),runtime);}}catch(e){admission={thrown:{name:(e as Error).name,message:(e as Error).message,code:(e as any).code??null,pointer:(e as any).pointer??null}};}
 const files=(result?.files??[]).map((f:any)=>{const bytes=new TextEncoder().encode(f.text),actualSha=sha(bytes);if(actualSha!==f.sha256)throw Error(`Stage-one emitted file digest mismatch: ${f.path}`);return {path:f.path,sha256:f.sha256,fileBytesSha256:actualSha,utf8Bytes:bytes.length,text:f.text};});
 return {id:v.id,operation:'generateAccessPackage',request:{request:v.request,profile:v.profile},admission:admission&&{ir:admission.ir,diagnostics:admission.diagnostics,dispositions:admission.dispositions,obligations:admission.obligations,thrown:admission.thrown},emission,result,expected,requestSha256:sha(JSON.stringify({request:v.request,profile:v.profile})),profileSha256:sha(JSON.stringify(v.profile)),resultSha256:sha(JSON.stringify(expected)),files};
});
const diffs=[{id:'base-to-report',before:vectors[0]!.result,after:vectors[1]!.result},{id:'base-to-projection',before:vectors[0]!.result,after:vectors[6]!.result}].map(v=>{const request={before:v.before,after:v.after},expected={ok:true,result:diffAccessPackages(v.before,v.after)};return {id:v.id,operation:'diffAccessPackages',request,expected,result:expected.result,inputSha256:sha(JSON.stringify(request)),resultSha256:sha(JSON.stringify(expected))};});
cases.sort((a,b)=>cmp(a.operation,b.operation)||cmp(a.id,b.id));
const operationsBytes=JSON.stringify({format:'umf-r3-oracle-cases/1',cases},null,2)+'\n',stageBytes=JSON.stringify({format:'umf-r3-stage-one-vectors/1',vectors,diffs},null,2)+'\n';
await mkdir(out,{recursive:true});await writeFile(`${out}/operations.json`,operationsBytes);await writeFile(`${out}/stage-one.json`,stageBytes);
const sourceClosure:Record<string,string>={};
const buildConfig={entrypoints:['scripts/codegen/entry.ts','scripts/codegen-corpus.ts','scripts/table-deployment-corpus.ts','scripts/table-migration-corpus.ts','scripts/row-scope-codegen-corpus.ts','scripts/rust-migration/r3/stage-one-entry.ts'],target:'bun' as const,write:false,metafile:true};
const build=await Bun.build(buildConfig);
if(!build.success||!build.metafile)throw Error('Could not enumerate the TypeScript oracle closure: '+build.logs.map(x=>x.message).join('\n'));
for(const p of Object.keys(build.metafile.inputs).sort(cmp))sourceClosure[p]=sha(await readFile(resolve(root,p)));
for(const p of ['scripts/rust-migration/r3/capture.ts','scripts/rust-migration/r3/replay.ts','scripts/rust-migration/r3/compare.ts','package.json','bun.lock','bun.lockb','python/umf_codegen/src/umf_codegen/_assets/generator.js.gz','python/umf_codegen/src/umf_codegen/_assets/manifest.json'])try{sourceClosure[p]=sha(await readFile(resolve(root,p)));}catch{}
const retainedBundlePath='python/umf_codegen/src/umf_codegen/_assets/generator.js.gz',retainedManifestPath='python/umf_codegen/src/umf_codegen/_assets/manifest.json',retainedBundle=await readFile(resolve(root,retainedBundlePath)),retainedManifestBytes=await readFile(resolve(root,retainedManifestPath)),retainedManifest=JSON.parse(retainedManifestBytes.toString('utf8')),retainedJavaScript=gunzipSync(retainedBundle);
if(sha(retainedJavaScript)!==retainedManifest.bundleSha256)throw Error('Retained embedded generator gzip does not match its checked-in manifest');
const sourceManifest={format:'umf-r3-source-manifest/1',builder:{bun:Bun.version,target:'bun',write:false,metafile:true,entrypoints:['scripts/codegen/entry.ts','scripts/codegen-corpus.ts','scripts/table-deployment-corpus.ts','scripts/table-migration-corpus.ts','scripts/row-scope-codegen-corpus.ts','scripts/rust-migration/r3/stage-one-entry.ts']},supplementalFiles:['scripts/rust-migration/r3/capture.ts','scripts/rust-migration/r3/replay.ts','scripts/rust-migration/r3/compare.ts','package.json','bun.lock','bun.lockb',retainedBundlePath,retainedManifestPath],files:Object.entries(sourceClosure).sort(([a],[b])=>cmp(a,b)).map(([path,sha256])=>({path,sha256}))};
const manifestBytes=JSON.stringify(sourceManifest,null,2)+'\n';await writeFile(`${out}/source-manifest.json`,manifestBytes);
const receipt={format:'umf-r3-baseline-receipt/1',oracle:'current TypeScript operation wrappers and direct stage-one compiler API; exact wrapper envelopes are retained',toolchain:{bun:Bun.version,typescript:JSON.parse(await readFile(resolve(root,'node_modules/typescript/package.json'),'utf8')).version,bunReportedNodeCompat:process.version,platform:process.platform,arch:process.arch},sourceManifest:{path:'source-manifest.json',sha256:sha(manifestBytes),fileCount:sourceManifest.files.length},retainedEmbeddedGenerator:{compressedPath:retainedBundlePath,compressedBytes:retainedBundle.length,compressedSha256:sha(retainedBundle),manifestPath:retainedManifestPath,manifestSha256:sha(retainedManifestBytes),decompressedJavaScriptBytes:retainedJavaScript.length,decompressedJavaScriptSha256:sha(retainedJavaScript),manifestBundleSha256:retainedManifest.bundleSha256,engine:retainedManifest.engine,v8:retainedManifest.v8,dependencies:retainedManifest.dependencies?.map((d:any)=>({name:d.name,version:d.version}))??[]},operationCorpus:{path:'operations.json',sha256:sha(operationsBytes),caseCount:cases.length,operations:[...new Set(cases.map(c=>c.operation))].sort(cmp)},stageOne:{path:'stage-one.json',sha256:sha(stageBytes),vectors:vectors.map(v=>({id:v.id,resultSha256:v.resultSha256,fileCount:v.files.length,admissionHasIR:!!v.admission?.ir,emissionCaptured:!!v.emission})),diffs:diffs.map(d=>d.id)},notes:['Operation requests and complete ordered result envelopes are retained per case.','Compile successes feed verifier cases; tampered and malformed inputs are separate refusal controls.','Stage-one captures private admitted IR, independent Python emission, full package result, input/profile digests, and emitted UTF-8 bytes.','The retained embedded bundle and its checked-in manifest are hashed independently of the current TypeScript oracle.','Bun process.version is recorded as Bun-reported Node compatibility metadata, not as evidence of an installed Node runtime.']};
await writeFile(`${out}/receipt.json`,JSON.stringify(receipt,null,2)+'\n');await rm(scratch,{recursive:true,force:true});console.log(JSON.stringify({cases:cases.length,operations:receipt.operationCorpus.operations,stageOne:vectors.length}));

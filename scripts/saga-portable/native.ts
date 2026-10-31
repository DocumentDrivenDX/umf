// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir} from 'node:fs/promises';
import {capturePortableProducerSnapshot,verifyPortableProducerSnapshot} from './custody';
const artifactPaths={nativeAddon:'bindings/core/node/umf_core_node.node',nativeBinding:'bindings/core/node/index.js'};
const snapshot=await capturePortableProducerSnapshot('.',artifactPaths);
const [{createCodegenEngine,createEngine},{createSagaResources},{Registry},{registerSagas,inspectSagas},{verifySagaVectors,verifySagaExchange}]=await Promise.all([
 import('../../bindings/core/node/index.js'),import('../../src/extensions/actions/saga-resources'),import('../../src/registry/registry'),import('../../src/extensions/actions/saga'),import('./verify')
]);
const corpus=await Bun.file('fixtures/saga/portable.json').json();
const resources=createSagaResources(),engine=createCodegenEngine(resources);
const originalFetch=globalThis.fetch;let hostCalls=0;globalThis.fetch=Object.assign(()=>{hostCalls++;throw Error('Artifact attempted host fetch');},{preconnect:()=>{hostCalls++;throw Error('Artifact attempted host preconnect');}});
let result;try{result=verifySagaVectors(engine,corpus.cases);}finally{globalThis.fetch=originalFetch;}if(hostCalls)throw Error('Saga artifact triggered host fetch');
console.log(JSON.stringify(result,null,2));
await mkdir('.cache/saga',{recursive:true});await Bun.write('.cache/saga/portable-native-preliminary.json',JSON.stringify(result,null,2)+'\n');
// The public facade admits only the explicit shared engine's immutable profile.
const core=createEngine(resources),registry=registerSagas(new Registry(core),engine);
verifySagaExchange(core,engine,corpus.cases.find((v:any)=>v.expected.unknown).source);
const publicResult=inspectSagas(corpus.cases[0].source,registry);
if(!publicResult.validation.valid)throw Error('Public saga facade baseline invalid');
const changed=registerSagas(new Registry(core),engine);changed.register({id:'vendor.changed',version:'0.1.0',coreVersion:'0.10.0',scopes:['module'],schema:true,description:'Registry mutation negative control',semantics:'inert',capabilities:{validation:'structural',directions:[],evidence:[]}});
let refused=false;try{inspectSagas(corpus.cases[0].source,changed);}catch(error){refused=(error as {code?:string}).code==='SAGA_REGISTRY_UNSUPPORTED';}if(!refused)throw Error('Mutated registry profile was accepted');
await verifyPortableProducerSnapshot('.',artifactPaths,snapshot);
const report={...result,profile:'umf.saga.portable-host-receipt/2',hostId:'native',host:'Bun N-API',runtime:{bun:Bun.version,platform:process.platform,arch:process.arch},hostCalls,qualificationInputs:snapshot.qualificationInputs,corpusSha256:snapshot.qualificationInputs['fixtures/saga/portable.json'],artifacts:{nativeAddon:{path:artifactPaths.nativeAddon,sha256:snapshot.artifacts.nativeAddon!},nativeBinding:{path:artifactPaths.nativeBinding,sha256:snapshot.artifacts.nativeBinding!}}};
await mkdir('.cache/saga',{recursive:true});await Bun.write('.cache/saga/portable-native.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));if(report.passed!==report.cases)process.exit(1);

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {canonicalJson, fail, importEntrypoint, openArtifact, parseReplayOptions} from './schema-graph-route-common.mjs';
const options=parseReplayOptions();
if(!['node','bun'].includes(options.runtime))fail('--runtime must be node or bun');
const artifact=await openArtifact(options);
const nativePath=resolve(artifact.files.addon);
const require=createRequire(import.meta.url);
const cacheKey=require.resolve(nativePath);
const addon=require(nativePath);
const nativeModule=require.cache[cacheKey];
if(!nativeModule||nativeModule.exports!==addon)fail('Native addon cache identity is unavailable');
let calls=0;const wireInputs=[],wireOutputs=[];
nativeModule.exports=new Proxy(addon,{get(target,key,receiver){const value=Reflect.get(target,key,receiver);if(key!=='inspectDomainPackLoaderWire'||typeof value!=='function')return value;return (...args)=>{calls++;wireInputs.push(args[0]);const result=Reflect.apply(value,target,args);wireOutputs.push(result);return result;};}});
const loader={version:'1.0.0',id:'umf.document-loader',implementation_version:'1.0.0',profile:'documents',runtime:'bun',entrypoint:'run.ts',configuration_schema:'inventory.schema.json',qualification:'finite inventory',artifacts:[{reference:'run.ts',sha256:'a'.repeat(64)},{reference:'inventory.schema.json',sha256:'b'.repeat(64)}]};
let accessorInvoked=0,toJsonInvoked=0;
const accessor=Object.defineProperty({...loader},'future_annotation',{enumerable:true,get(){accessorInvoked++;return {unexpected:true};}});
const toJson={...loader,toJSON(){toJsonInvoked++;return loader;}};
const cycle={...loader};cycle.future_annotation=cycle;
const malformedDuplicate={...loader,artifacts:[{reference:'run.ts',sha256:'A'.repeat(64)},{reference:'run.ts',sha256:'b'.repeat(64)}]};
const duplicateIncomplete={...loader,artifacts:[{reference:'run.ts',sha256:'a'.repeat(64)},{reference:'run.ts',sha256:'b'.repeat(64)}]};
let deep=null;for(let i=0;i<127;i++)deep=[deep];
const validExtended={...loader,qualification:String.fromCharCode(0xD800),future_annotation:deep,extension:{opaque:'kept',surrogate:String.fromCharCode(0xD800)},artifacts:[{...loader.artifacts[0],annotation:{future:'retained',surrogate:String.fromCharCode(0xDFFF)}},{...loader.artifacts[1]}]};
const cases=[
 ['valid',loader,true],['unknown-annotations-surrogates-and-depth',validExtended,true],
 ['unsupported-version',{...loader,version:'9.0.0'},true],['unsupported-id',{...loader,id:'future.loader'},true],
 ['unsupported-runtime',{...loader,runtime:'node'},true],['unsupported-profile',{...loader,profile:'future'},true],
 ['malformed-precedes-duplicate-and-closure',malformedDuplicate,true],['duplicate-and-incomplete-closure',duplicateIncomplete,true],
 ['accessor-refusal-no-evaluation',accessor,false],['toJSON-refusal-no-evaluation',toJson,false],['cycle-refusal',cycle,false],
];
try{
 const [api,reference]=await Promise.all([importEntrypoint(artifact.files.node),importEntrypoint(artifact.files.reference)]);
 const fn=api.inspectDomainPackLoader,ref=reference.inspectDomainPackLoader;
 assert.equal(typeof fn,'function');assert.equal(typeof ref,'function');assert.equal(fn.name,'inspectDomainPackLoader');assert.equal(fn.length,1);assert.equal(ref.name,'inspectDomainPackLoader');assert.equal(ref.length,1);
 const resultCases=[];let expectedCalls=0;let wireIndex=0;
 for(const [name,input,dispatchExpected] of cases){
  const before=calls;const actual=fn(input);const after=calls;const expected=ref(input);
  assert.deepEqual(actual,expected,`${name} default/reference parity`);
  const delta=after-before;assert.equal(delta,dispatchExpected?1:0,`${name} Rust dispatch count`);
  let nativeWireInputSha256=null,nativeOutputSha256=null,nativeWireInput=null,nativeWireOutput=null;
  if(dispatchExpected){nativeWireOutput=wireOutputs[wireIndex];nativeWireInput=wireInputs[wireIndex];assert.deepEqual(JSON.parse(nativeWireOutput),actual,`${name} direct native result parity`);assert.equal(nativeWireInput,JSON.stringify(input),`${name} wrapper wire changed the JSON input`);nativeWireInputSha256=createHash('sha256').update(nativeWireInput).digest('hex');nativeOutputSha256=createHash('sha256').update(nativeWireOutput).digest('hex');wireIndex++;}
  if(dispatchExpected)expectedCalls++;
  resultCases.push({name,result:actual,dispatches:delta,nativeWireInputSha256,nativeOutputSha256,nativeWireInput,nativeWireOutput});
 }
 assert.equal(accessorInvoked,0);assert.equal(toJsonInvoked,0);
 assert.equal(calls,expectedCalls);assert.equal(wireInputs.length,calls);assert.equal(wireOutputs.length,calls);
 process.stdout.write(JSON.stringify({status:'pass',host:options.runtime,runtime:options.runtime==='bun'?process.versions.bun:process.version,artifact:{manifestSha256:artifact.manifestSha,packageJsonSha256:artifact.packageSha,packageManifestSha256:artifact.packageManifestSha256,sourceClosureSha256:artifact.sourceClosureSha256},function:{name:fn.name,arity:fn.length},nativeDispatches:calls,expectedNativeDispatches:expectedCalls,accessorInvoked,toJsonInvoked,wireInputs:wireInputs.map(value=>({bytes:Buffer.byteLength(value),sha256:createHash('sha256').update(value).digest('hex')})),cases:resultCases})+'\n');
}finally{nativeModule.exports=addon;await artifact.cleanup();}

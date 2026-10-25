import {expect,test} from 'bun:test';
import {createPythonClientRustCandidateV2,type PythonClientRequest,type PythonClientRustGenerator,type PythonClientRustOptions} from '@umf/core/rust-codegen-candidate/v2';
import {generatePythonClient as directReference} from '../src/access';
import {CODEGEN_RESOURCES} from '../src/access/codegen-resources';
import {UmfError} from '../src/model/errors';

const corpusPath=new URL('../docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json',import.meta.url);
const corpus=JSON.parse(await Bun.file(corpusPath).text()) as {cases:{id:string;operation:string;request:PythonClientRequest;expected:any}[]};
const source=await Bun.file(new URL('./unified/commerce.json',import.meta.url)).text();
const rustGenerate=await createPythonClientRustCandidateV2();
const typedOptions:PythonClientRustOptions={controls:{maxWork:10_000_000}};
const typedFactory:Promise<PythonClientRustGenerator>=createPythonClientRustCandidateV2(typedOptions);
void typedFactory;

test('the default package export keeps the legacy generator; V2 is subpath-only',async()=>{
 const defaultApi=await import('@umf/core');
 expect(defaultApi).toHaveProperty('generatePythonClient');
 expect(defaultApi).not.toHaveProperty('generatePythonClientRustCandidate');
});

test('Rust facade matches all 31 frozen generatePythonClient R3 requests exactly',()=>{
 const cases=corpus.cases.filter(item=>item.operation==='generatePythonClient');
 expect(cases).toHaveLength(31);
 for(const item of cases){
  let actual:any;
  try{actual={ok:true,result:rustGenerate(item.request)};}
  catch(error){const value=error as UmfError;actual={ok:false,error:{code:value.code,message:value.message,path:value.path}};}
  expect(actual).toEqual(item.expected);
 }
},{timeout:60_000});

test('Rust facade freezes the direct result shape and trusted resource set',()=>{
 const result=rustGenerate({text:source,package:'shop'});
 expect(Object.keys(result).sort()).toEqual(['description','files','sourceDigest']);
 expect(result.description).toBeTruthy();
 expect(result.files.every(file=>typeof file.path==='string'&&typeof file.text==='string'&&/^[0-9a-f]{64}$/.test(file.sha256))).toBe(true);
 expect(Object.keys(CODEGEN_RESOURCES).sort()).toEqual(['actionsPackage','bindingPackage','constraints','coreSchema','domainPolicy','packageSchema','referenceSchema','stableBindingPackage','tablesPackage']);
 expect(Object.isFrozen(CODEGEN_RESOURCES)).toBe(true);
 for(const resource of Object.values(CODEGEN_RESOURCES))expect(Object.isFrozen(resource)).toBe(true);
});

test('stable getters and proxies are snapshotted before Rust without dropping accepted requests',()=>{
 let directGetterReads=0,rustGetterReads=0;
 const directRequest={package:'shop',get text(){directGetterReads++;return source;}};
 const rustRequest={package:'shop',get text(){rustGetterReads++;return source;}};
 const directGetterResult=directReference(directRequest as PythonClientRequest);
 const rustGetterResult=rustGenerate(rustRequest as PythonClientRequest);
 expect(rustGetterResult).toEqual(directGetterResult);
 expect(directGetterResult.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
 expect(directGetterReads).toBe(4);
 expect(rustGetterReads).toBe(1);

 let directProxyReads=0,rustProxyReads=0;
 const directProxy=new Proxy({text:source,package:'shop'},{get(target,key,receiver){directProxyReads++;return Reflect.get(target,key,receiver);}});
 const rustProxy=new Proxy({text:source,package:'shop'},{get(target,key,receiver){rustProxyReads++;return Reflect.get(target,key,receiver);}});
 const directProxyResult=directReference(directProxy as PythonClientRequest);
 const rustProxyResult=rustGenerate(rustProxy as PythonClientRequest);
 expect(directProxyResult).toEqual(rustProxyResult);
 expect(directProxyReads).toBe(18);
 expect(rustProxyReads).toBe(5);

 const sentinel=new Error('getter sentinel');let directThrowReads=0,rustThrowReads=0;
 const directThrow={package:'shop',get text(){directThrowReads++;throw sentinel;}};
 const rustThrow={package:'shop',get text(){rustThrowReads++;throw sentinel;}};
 expect(()=>directReference(directThrow as unknown as PythonClientRequest)).toThrow(sentinel);
 expect(()=>rustGenerate(rustThrow as unknown as PythonClientRequest)).toThrow(sentinel);
 expect(directThrowReads).toBe(1);
 expect(rustThrowReads).toBe(1);
});

test('V2 snapshot order is versioned and can change the first refusal',()=>{
 const sentinel=new Error('records getter sentinel');let legacyReads=0,candidateReads=0;
 const legacyRequest={text:source,package:'bad-name',get records(){legacyReads++;throw sentinel;}};
 const candidateRequest={text:source,package:'bad-name',get records(){candidateReads++;throw sentinel;}};
 let directFailure:unknown,rustFailure:unknown;
 try{directReference(legacyRequest as unknown as PythonClientRequest);}catch(error){directFailure=error;}
 try{rustGenerate(candidateRequest as unknown as PythonClientRequest);}catch(error){rustFailure=error;}
 expect(directFailure).toBeInstanceOf(UmfError);
 expect(directFailure).toMatchObject({code:'ACCESS_UNSUPPORTED',path:'/package',message:'Ordinary non-shadowing Python package required'});
 expect(legacyReads).toBe(0);
 expect(rustFailure).toBe(sentinel);
 expect(candidateReads).toBe(1);
});

test('Node and browser V2 factories apply the same cooperative cancellation control',async()=>{
 const {createPythonClientRustCandidateV2:createBrowserCandidate}=await import(new URL('../dist/umf-rust-codegen-candidate-v2-browser.js',import.meta.url).href);
 let nodeCancelled=false,browserCancelled=false;
 const nodeGenerator=await createPythonClientRustCandidateV2({controls:{isCancelled:()=>nodeCancelled}});
 const browserGenerator=await createBrowserCandidate({controls:{isCancelled:()=>browserCancelled}});
 nodeCancelled=true;browserCancelled=true;
 for(const generate of [nodeGenerator,browserGenerator])expect(()=>generate({text:source,package:'shop'})).toThrow(/Operation cancelled by host/);
});

test('Unicode and resource controls retain their legacy outcomes for cutover qualification',()=>{
 const unicode=source.replace('Unified client commerce fixture','\ud800');
 const failure=(run:()=>unknown)=>{try{run();return undefined;}catch(error){const value=error as Error&{code?:string;path?:string};return {name:value.constructor.name,errorName:value.name,code:value.code,message:value.message,path:value.path};}};
 const directUnicodeError=failure(()=>directReference({text:unicode,package:'shop'}));
 const rustUnicodeError=failure(()=>rustGenerate({text:unicode,package:'shop'}));
 expect(directUnicodeError).toEqual({name:'Error',errorName:'Error',code:undefined,message:'INPUT',path:undefined});
 expect(rustUnicodeError).toEqual(directUnicodeError);
 const oversized=source.replace('Unified client commerce fixture','x'.repeat(4_000_016));
 const directResourceError=failure(()=>directReference({text:oversized,package:'shop'}));
 const rustResourceError=failure(()=>rustGenerate({text:oversized,package:'shop'}));
 expect(directResourceError?.code).toBe('LIMIT');
 expect(rustResourceError?.code).toBe('LIMIT');
 expect(rustResourceError?.message).toBe(directResourceError?.message);
},{timeout:60_000});

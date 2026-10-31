// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {assertPythonClientRustPlatformV4} from '../src/access/rust-default-v4';
import {generatePythonClient as generateTypescript} from '../src/access';
import {generatePythonClient as generateNode} from '../src/index-node-v4';
import {initializePythonClientRustDefaultV4} from '../src/access/rust-default-v4';

const source=await Bun.file(new URL('../tests/unified/commerce.json',import.meta.url)).text();

test('V4 root route has closed native platform cohorts',()=>{
 expect(()=>assertPythonClientRustPlatformV4('darwin','arm64')).not.toThrow();
 expect(()=>assertPythonClientRustPlatformV4('linux','x64')).not.toThrow();
 for(const [platform,architecture] of [['darwin','x64'],['linux','arm64'],['win32','x64'],['freebsd','x64']]){
  expect(()=>assertPythonClientRustPlatformV4(platform!,architecture!)).toThrow(/UMF_RUST_CODEGEN_UNSUPPORTED_PLATFORM/);
 }
});
const request={text:source,package:'shop',records:[{module:'commerce',element:'Order'}],actions:[{module:'commerce',action:'shipOrder'}]};

test('Node/Bun root entry exposes synchronous V4 generation after import',()=>{
 const expected=generateTypescript(request);
 const result=generateNode(request);
 expect(result).toEqual(expected);
 expect(result).not.toBeInstanceOf(Promise);
},30_000);

test('root initialization rejects the module on asset or engine initialization failure',async()=>{
 const failure=new Error('injected native/WASM initialization failure');
 const key=Symbol.for('umf.rust-codegen-default-v4.init-failure');
 (globalThis as any)[key]=failure;
 let caught:unknown;
 try{await import(new URL(`./fixtures/rust-codegen-default-v4-init-failure.ts?case=${Date.now()}`,import.meta.url).href);}
 catch(error){caught=error;}
 finally{delete (globalThis as any)[key];}
 expect(caught).toBe(failure);
});

test('initialization refuses a malformed engine rather than selecting a TypeScript fallback',async()=>{
 await expect(initializePythonClientRustDefaultV4(async()=>undefined)).rejects.toThrow('Rust codegen initialization did not return a generator');
});

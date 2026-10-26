// SPDX-License-Identifier: MIT OR Apache-2.0
// Fresh 14-case TypeScript-vs-direct-WASM securityNot comparison in Chromium.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root=resolve(import.meta.dirname,'../../..');
const toolchain=process.env.UMF_RUST_TOOLCHAIN??'/Users/erik/.rustup/toolchains/1.90.0-aarch64-apple-darwin/bin';
const bindgen=process.env.UMF_WASM_BINDGEN??'/private/tmp/umf-wasm-bindgen-0.2.100/bin/wasm-bindgen';
const target='/private/tmp/umf-r8-security-not-browser-cargo';
const output='/private/tmp/umf-r8-security-not-browser';
const wasmOut=`${output}/wasm`;
const receipt=resolve(process.argv[2]??'docs/helix/04-build/evidence/rust-migration/r8-security-not-direct-binding/chromium.json');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=path=>readFile(resolve(root,path));
const run=async(command,args,env={})=>{
  const child=Bun.spawn([command,...args],{cwd:root,env:{...process.env,...env},stdout:'pipe',stderr:'pipe'});
  const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
  const code=await child.exited;if(code)throw new Error(`${command} ${args.join(' ')} failed (${code})\n${stdout}\n${stderr}`);return stdout.trim();
};
await mkdir(wasmOut,{recursive:true});
await run(`${toolchain}/cargo`,['build','--locked','--offline','--release','--manifest-path','bindings/core/wasm/Cargo.toml','--target','wasm32-unknown-unknown'],{CARGO_TARGET_DIR:target,RUSTC:`${toolchain}/rustc`});
const bindgenVersion=await run(bindgen,['--version']);
assert.equal(bindgenVersion,'wasm-bindgen 0.2.100');
await Bun.$`${bindgen} --target web --out-dir ${wasmOut} --out-name umf_core_wasm ${target}/wasm32-unknown-unknown/release/umf_core_wasm.wasm`.quiet();
const bundle=await Bun.build({entrypoints:['scripts/rust-migration/r8/security-not-browser-entry.ts'],target:'browser',format:'esm',outdir:output});
if(!bundle.success)throw new Error(bundle.logs.map(item=>item.message).join('\n'));
const entrySource=await readFile(`${output}/security-not-browser-entry.js`,'utf8');
const glueSource=await readFile(`${wasmOut}/umf_core_wasm.js`,'utf8');
const wasmBytes=await readFile(`${wasmOut}/umf_core_wasm_bg.wasm`);
const browserErrors=[];let browser;
try{
  browser=await chromium.launch({headless:true,timeout:30000,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();page.on('pageerror',error=>browserErrors.push(String(error)));
  await page.goto('about:blank');
  const result=await page.evaluate(async({glueSource,wasmBase64,entrySource})=>{
    const wasmBytes=Uint8Array.from(atob(wasmBase64),c=>c.charCodeAt(0));
    const glueUrl=URL.createObjectURL(new Blob([glueSource],{type:'text/javascript'}));
    const module=await import(glueUrl);await module.default(wasmBytes);
    const entryUrl=URL.createObjectURL(new Blob([entrySource],{type:'text/javascript'}));
    return (await import(entryUrl)).runSecurityNotBrowserCases(module);
  },{glueSource,wasmBase64:wasmBytes.toString('base64'),entrySource});
  const rawMismatches=result.cases.filter(name=>!result.rows[name].rawEqual);
  const guardedMismatches=result.cases.filter(name=>!result.rows[name].guardedEqual);
  const debugPath=resolve(process.env.UMF_SECURITY_NOT_BROWSER_DEBUG??'/private/tmp/umf-r8-security-not-browser-debug.json');
  await writeFile(debugPath,JSON.stringify({format:'umf-r8-security-not-browser-debug/1',rawMismatches,guardedMismatches,rows:Object.fromEntries(result.cases.map(name=>[name,result.rows[name]]))},null,2)+'\n');
  console.error(JSON.stringify({debugPath,rawMismatches,guardedMismatches},null,2));
  assert.deepEqual(browserErrors,[]);
  assert.equal(result.cases.length,14);
  assert.deepEqual(result.cases.filter(name=>result.rows[name].rawEqual),['T','F','U'],'raw binding parity is limited to the three valid truth tokens');
  const withoutErrorClass=outcome=>{const {name,constructor,...rest}=outcome;return rest;};
  for(const name of result.cases.filter(name=>!['T','F','U'].includes(name))){
    assert.deepEqual(withoutErrorClass(result.rows[name].raw),withoutErrorClass(result.rows[name].reference),`unexpected raw mismatch beyond the known error-class boundary: ${name}`);
    assert.equal(result.rows[name].raw.name,'UmfCoreError',`raw error class changed: ${name}`);
    assert.equal(result.rows[name].reference.name,'UmfError',`TypeScript predecessor error class changed: ${name}`);
  }
  assert.deepEqual(guardedMismatches,[],'compatibility adapter must preserve all 14 TypeScript outcomes and host-effect traces');
  const artifactPaths=[
    'src/extensions/security/logic.ts','src/extensions/security/rust-not-adapter.ts','src/index.ts','src/index-browser-v4.ts','src/model/errors.ts',
    'bindings/core/wasm/index.js','scripts/rust-migration/r8/security-not-parity.mjs',
    'bindings/core/wasm/src/security-logic.js','bindings/core/wasm/src/lib.rs',
    'crates/umf-core-wire/src/security_logic_binding.rs','crates/umf-core/src/security_logic.rs',
    'scripts/rust-migration/r8/security-not-browser.mjs','scripts/rust-migration/r8/security-not-browser-entry.ts',
  ];
  const artifacts=Object.fromEntries(await Promise.all(artifactPaths.map(async path=>[path,sha(await read(path))])));
  const rawMatchCount=result.cases.length-rawMismatches.length;
  const record={format:'umf-r8-security-not-browser-parity/1',status:'pass-guarded-parity-raw-error-class-blocker',runtime:{bun:Bun.version,cargo:await run(`${toolchain}/cargo`,['--version']),rustc:await run(`${toolchain}/rustc`,['--version']),wasmBindgen:bindgenVersion,chromium:browser.version(),userAgent:await page.evaluate(()=>navigator.userAgent)},profile:'umf.security-logic/1.0.0',cases:result.rows,parity:{raw:{matches:rawMatchCount,total:result.cases.length,validTruthOnly:true,invalidMismatch:'UmfError versus UmfCoreError; code/message/path/host effects otherwise equal'},guarded:{matches:14,total:14,sourceAdapter:'src/extensions/security/rust-not-adapter.ts'}},artifacts:{...artifacts,'fresh-wasm':sha(wasmBytes),'fresh-wasm-bindgen-glue':sha(Buffer.from(glueSource)),'browser-entry-bundle':sha(Buffer.from(entrySource))},limits:['Fresh source-level direct scalar WASM and compatibility-adapter comparison only; no installed-package qualification or default-route change.','Fourteen same-host cases cover T/F/U, invalid scalar and object shapes, accessor, and Proxy traps. No timing or broader security operation claims.']};
  await mkdir(resolve(receipt,'..'),{recursive:true});await writeFile(receipt,JSON.stringify(record,null,2)+'\n');
  console.log(JSON.stringify({receipt,chromium:record.runtime.chromium,cases:result.cases.length,rawMatches:rawMatchCount,guardedMatches:14},null,2));
}finally{await browser?.close();}

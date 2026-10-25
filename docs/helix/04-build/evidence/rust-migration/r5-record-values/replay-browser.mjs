// Replay record-value predecessor vectors through the rebuilt WASM binding in Chromium or Edge.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium} from 'playwright';

const root=process.cwd();
const pkg=process.env.UMF_R5_RECORD_VALUES_WASM_PKG;
const bundle=process.env.UMF_R5_RECORD_VALUES_WASM_BUNDLE;
if(!pkg||!bundle)throw new Error('UMF_R5_RECORD_VALUES_WASM_PKG and UMF_R5_RECORD_VALUES_WASM_BUNDLE are required');
const browserName=process.env.UMF_R5_RECORD_VALUES_BROWSER??'chromium';
const read=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const resources=Object.fromEntries(await Promise.all([['coreSchema','spec/core/schema.json'],['referenceSchema','spec/core/semantic-type-reference.schema.json'],['packageSchema','spec/core/extension-package.schema.json'],['constraints','spec/metamodel/generated/core-constraints.json'],['domainPolicy','spec/metamodel/generated/domain-policy.json']].map(async([k,p])=>[k,await read(p)])));
const packet=await read('docs/helix/04-build/evidence/rust-migration/r5-record-values/frozen-typescript.json');
const bundleText=await readFile(bundle,'utf8');
const glueText=await readFile(resolve(pkg,'umf_core_wasm.js'),'utf8');
const wasmBytes=await readFile(resolve(pkg,'umf_core_wasm_bg.wasm'));
let browser;
try{
  const options={headless:true};if(browserName==='edge')options.channel='msedge';browser=await chromium.launch(options);
  const page=await browser.newPage();await page.goto('about:blank');
  const wasmBase64=wasmBytes.toString('base64');
  const replay=await page.evaluate(async({bundleText,glueText,wasmBase64,resources,packet})=>{
    const dataUrl=source=>`data:text/javascript;base64,${btoa(unescape(encodeURIComponent(source)))}`;
    const api=await import(dataUrl(bundleText));
    const wasm=await import(dataUrl(glueText));
    const wasmBytes=Uint8Array.from(atob(wasmBase64),c=>c.charCodeAt(0));
    await wasm.default(wasmBytes);
    const engine=await api.initializeCoreModelWasm(resources,async()=>wasm,globalThis);
    const capture=fn=>{try{return{result:fn()};}catch(error){return{thrown:{code:error.code??null,path:error.path??null,message:error.message}};}};
    const selected=['valid-present','invalid-source-version','sol-surrogate-present','sol-array-record-identity'];
    const actual={};for(const c of packet.cases.filter(x=>selected.includes(x.id)))actual[c.id]=capture(()=>engine.validateCoreRecordValues(c.source,c.identity,c.values));
    const success=packet.cases.find(c=>c.id==='valid-present');const result=engine.validateCoreRecordValues(success.source,success.identity,success.values);result.source.umf='changed';
    let resourceRefusal;try{(await api.initializeCoreModelWasm(resources,async()=>wasm,globalThis,{controls:{maxWork:0}})).validateCoreRecordValues(success.source,success.identity,success.values);resourceRefusal={ok:true};}catch(error){resourceRefusal={ok:false,code:error.code??'',message:error.message??String(error),path:error.path??''};}
    return{actual,copiedResultIsolation:success.source.umf==='0.10.0',resourceRefusal,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis)};
  },{bundleText,glueText,wasmBase64,resources,packet});
  const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
  for(const c of packet.cases.filter(x=>Object.hasOwn(replay.actual,x.id))){const expected=c.thrown?{thrown:{code:c.thrown.code,path:c.thrown.path,message:c.thrown.message}}:{result:c.result};assert.equal(canonical(replay.actual[c.id]),canonical(expected),c.id);}
  assert.equal(replay.copiedResultIsolation,true);assert.equal(replay.resourceRefusal.ok,false);assert.equal(replay.resourceRefusal.code,'RESOURCE_LIMIT');assert.equal(replay.nodeGlobalsAbsent,true);
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const sourcePaths=['crates/umf-core/src/record_values.rs','crates/umf-core-wire/src/lib.rs','bindings/core/wasm/index.js','bindings/core/wasm/src/core-model.js','bindings/core/wasm/src/wire.js','bindings/core/wasm/index.d.ts','docs/helix/04-build/evidence/rust-migration/r5-record-values/replay-browser.mjs'];
  const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,hash(await readFile(resolve(root,p)))])));
  const packetSha256=hash(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-record-values/frozen-typescript.json')));
  const receipt={status:'pass',browser:browserName,version:browser.version(),target:'wasm32-unknown-unknown',cargoProfile:'release',wasmSha256:hash(wasmBytes),wasmBytes:wasmBytes.length,wasmGlueSha256:hash(glueText),packetSha256,sourceHashes,cases:Object.keys(replay.actual),resourceRefusal:replay.resourceRefusal,copiedResultIsolation:replay.copiedResultIsolation,nodeGlobalsAbsent:replay.nodeGlobalsAbsent};
  await writeFile(process.env.UMF_R5_RECORD_VALUES_RECEIPT??resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-record-values',`${browserName}.json`),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({status:receipt.status,browser:browserName,version:receipt.version,wasmSha256:receipt.wasmSha256,cases:receipt.cases.length,resourceRefusal:receipt.resourceRefusal.code}));
}finally{await browser?.close();}

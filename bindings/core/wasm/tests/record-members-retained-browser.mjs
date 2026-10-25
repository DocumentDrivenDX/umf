// Chromium replay for retained WASM Core Record Members against the frozen packet.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname, join, normalize} from 'node:path';
import {chromium} from 'playwright';

const root = process.cwd(), pkgSource = process.env.UMF_RECORD_MEMBERS_WASM_PKG;
if (!pkgSource) throw new Error('UMF_RECORD_MEMBERS_WASM_PKG is required');
const host = '/private/tmp/umf-record-members-retained-chromium', pkg = join(host, 'wasm/pkg');
await mkdir(join(host, 'wasm/src'), {recursive:true}); await mkdir(pkg, {recursive:true});
await writeFile(join(host, 'wasm/index.js'), await readFile(join(root, 'bindings/core/wasm/index.js')));
for (const file of await readdir(join(root, 'bindings/core/wasm/src'))) if (file.endsWith('.js')) await writeFile(join(host, 'wasm/src', file), await readFile(join(root, 'bindings/core/wasm/src', file)));
await writeFile(join(host, 'wasm/package.json'), '{"type":"module"}');
for (const file of ['umf_core_wasm.js','umf_core_wasm_bg.wasm','umf_core_wasm.d.ts']) await writeFile(join(pkg,file), await readFile(join(pkgSource,file)));
const paths={coreSchema:'spec/core/schema.json',referenceSchema:'spec/core/semantic-type-reference.schema.json',packageSchema:'spec/core/extension-package.schema.json',constraints:'spec/metamodel/generated/core-constraints.json',domainPolicy:'spec/metamodel/generated/domain-policy.json'};
const [resources,frozen]=await Promise.all([
  Promise.all(Object.entries(paths).map(async([key,path])=>[key,JSON.parse(await readFile(join(root,path),'utf8'))])).then(Object.fromEntries),
  readFile(join(root,'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json'),'utf8').then(JSON.parse),
]);
await writeFile(join(host,'input.json'),JSON.stringify({resources,frozen}));
const mime={'.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.d.ts':'text/plain'};
const server=createServer(async(req,res)=>{try{const path=normalize(join(host,decodeURIComponent(new URL(req.url,'http://localhost').pathname)));if(!path.startsWith(host))throw Error('path');res.writeHead(200,{'content-type':mime[extname(path)]??'application/octet-stream'});res.end(await readFile(path));}catch{res.writeHead(404);res.end('not found');}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve)); let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/input.json`);
  const actual=await page.evaluate(async()=>{const {resources,frozen}=await(await fetch('/input.json')).json();const module=await import('/wasm/pkg/umf_core_wasm.js');await module.default();const {createCoreRecordMembersEngine}=await import('/wasm/index.js');let resourcePrototypeRefusal;try{createCoreRecordMembersEngine(module,Object.assign(Object.create({future:true}),resources))}catch(error){resourcePrototypeRefusal={name:error.name,message:error.message}}const nullPrototypeResources=Object.assign(Object.create(null),resources);const nullPrototypeEngine=createCoreRecordMembersEngine(module,nullPrototypeResources);nullPrototypeEngine.dispose();const engine=createCoreRecordMembersEngine(module,resources);const outcomes={};for(const[name,{source,identity}]of Object.entries(frozen.cases)){try{outcomes[name]={ok:true,value:engine.inspectCoreRecordMembers(source,identity)}}catch(error){outcomes[name]={ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}}}}engine.dispose();let disposed;try{engine.inspectCoreRecordMembers({}, {module:'m',element:'e'})}catch(error){disposed=error.code}return{outcomes,disposed,nodeGlobalsAbsent:!('process'in globalThis)&&!('Buffer'in globalThis),resourcePrototypeRefusal,nullPrototypeResourcesAccepted:true}});
  assert.equal(actual.nodeGlobalsAbsent,true);assert.equal(actual.disposed,'CORE_RECORD_MEMBERS_DISPOSED');assert.deepEqual(actual.resourcePrototypeRefusal,{name:'TypeError',message:'Engine resources must be a plain object'});assert.equal(actual.nullPrototypeResourcesAccepted,true);for(const[name,expected]of Object.entries(frozen.outcomes))assert.equal(JSON.stringify(actual.outcomes[name]),JSON.stringify(expected),name);
  const hash=async path=>createHash('sha256').update(await readFile(path)).digest('hex');const packet='docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/frozen-typescript.json';const sources=['bindings/core/wasm/index.js','bindings/core/wasm/index.d.ts','bindings/core/wasm/src/lib.rs','bindings/core/wasm/src/record_members_inspection.rs','crates/umf-core-wire/src/record_members_inspection_binding.rs','crates/umf-core/src/record_members_inspection.rs','crates/umf-core-wire/tests/r5_record_members_inspection.rs','bindings/core/wasm/tests/record-members-retained.test.js','bindings/core/wasm/tests/record-members-retained-browser.mjs'];
  const receipt={format:'umf-r5-record-members-retained-wasm/1',status:'pass',scope:'opt-in retained WASM inspector only; not default package or release qualification',chromium:browser.version(),cases:Object.keys(actual.outcomes).length,nodeGlobalsAbsent:actual.nodeGlobalsAbsent,disposedCode:actual.disposed,resourcePrototypeRefusal:actual.resourcePrototypeRefusal,nullPrototypeResourcesAccepted:actual.nullPrototypeResourcesAccepted,packetSha256:await hash(join(root,packet)),sourceSha256:Object.fromEntries(await Promise.all(sources.map(async path=>[path,await hash(join(root,path))]))),resourceSha256:Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>[key,await hash(join(root,path))]))),artifacts:{wasmBindgenJs:await hash(join(pkg,'umf_core_wasm.js')),wasm:await hash(join(pkg,'umf_core_wasm_bg.wasm'))},actual:actual.outcomes};
  const receiptPath=process.env.UMF_RECORD_MEMBERS_WASM_RECEIPT??'docs/helix/04-build/evidence/rust-migration/r5-record-members-inspection/wasm-retained.json';await writeFile(join(root,receiptPath),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({status:receipt.status,chromium:receipt.chromium,cases:receipt.cases,nodeGlobalsAbsent:receipt.nodeGlobalsAbsent,artifacts:receipt.artifacts,receipt:receiptPath}));
}finally{await browser?.close();server.close();}

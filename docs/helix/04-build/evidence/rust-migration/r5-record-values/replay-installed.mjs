// Replay record-value predecessor vectors through an installed packed Rust binding.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root=resolve(new URL('../../../../../../',import.meta.url).pathname);
const entry=process.env.UMF_R5_RECORD_VALUES_ENTRY;
if(!entry)throw new Error('UMF_R5_RECORD_VALUES_ENTRY is required');
const {createCoreModelEngine}=await import(entry);
const read=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const resources=Object.fromEntries(await Promise.all([['coreSchema','spec/core/schema.json'],['referenceSchema','spec/core/semantic-type-reference.schema.json'],['packageSchema','spec/core/extension-package.schema.json'],['constraints','spec/metamodel/generated/core-constraints.json'],['domainPolicy','spec/metamodel/generated/domain-policy.json']].map(async([k,p])=>[k,await read(p)])));
const packet=await read('docs/helix/04-build/evidence/rust-migration/r5-record-values/frozen-typescript.json');
const selected=['valid-present','invalid-source-version','sol-surrogate-present','sol-array-record-identity'];
const engine=createCoreModelEngine(resources);
const capture=fn=>{try{return{result:fn()};}catch(error){return{thrown:{code:error.code??null,path:error.path??null,message:error.message}};}};
const canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`:JSON.stringify(v);
for(const c of packet.cases.filter(x=>selected.includes(x.id))){const actual=capture(()=>engine.validateCoreRecordValues(c.source,c.identity,c.values));const expected=c.thrown?{thrown:{code:c.thrown.code,path:c.thrown.path,message:c.thrown.message}}:{result:c.result};assert.equal(canonical(actual),canonical(expected),c.id);}
const success=packet.cases.find(c=>c.id==='valid-present');
const copy=engine.validateCoreRecordValues(success.source,success.identity,success.values);copy.source.umf='changed';assert.equal(success.source.umf,'0.10.0');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourcePaths=['crates/umf-core/src/record_values.rs','crates/umf-core-wire/src/lib.rs','bindings/core/node/index.js','bindings/core/node/package.json','bindings/core/node/src/core-model.js','bindings/core/node/src/wire.js','bindings/core/node/index.d.ts','bindings/core/wasm/index.js','bindings/core/wasm/src/core-model.js','bindings/core/wasm/src/wire.js','bindings/core/wasm/index.d.ts','crates/umf-core-wire/tests/r5_record_values_wire.rs','bindings/core/node/tests/core-model-wrapper.test.js','docs/helix/04-build/evidence/rust-migration/r5-record-values/replay-installed.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async p=>[p,hash(await readFile(resolve(root,p)))])));
const packetHash=hash(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-record-values/frozen-typescript.json')));
const artifact=await readFile(process.env.UMF_R5_RECORD_VALUES_ARTIFACT);
const receipt={status:'pass',runtime:typeof Bun==='undefined'?'node':'bun',version:typeof Bun==='undefined'?process.version:Bun.version,installation:'locally packed @umf/core-rust-native tarball',artifactSha256:hash(artifact),packetSha256:packetHash,sourceHashes,cases:selected,copiedResultIsolation:true};
await writeFile(process.env.UMF_R5_RECORD_VALUES_RECEIPT??resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-record-values',`${receipt.runtime}.json`),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({status:receipt.status,runtime:receipt.runtime,version:receipt.version,artifactSha256:receipt.artifactSha256,cases:selected.length,copiedResultIsolation:true}));

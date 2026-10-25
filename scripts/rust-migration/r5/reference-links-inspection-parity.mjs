// SPDX-License-Identifier: MIT OR Apache-2.0
// Compare opt-in Node/Rust results to the frozen current TypeScript predecessor.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createCoreModelEngine} from '../../../bindings/core/node/index.js';
import frozen from '../../../docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/frozen-typescript.json' with {type:'json'};
import coreSchema from '../../../spec/core/schema.json' with {type:'json'};
import referenceSchema from '../../../spec/core/semantic-type-reference.schema.json' with {type:'json'};
import packageSchema from '../../../spec/core/extension-package.schema.json' with {type:'json'};
import constraints from '../../../spec/metamodel/generated/core-constraints.json' with {type:'json'};
import domainPolicy from '../../../spec/metamodel/generated/domain-policy.json' with {type:'json'};
const engine=createCoreModelEngine({coreSchema,referenceSchema,packageSchema,constraints,domainPolicy});
const actuals={};
for(const [name,{source,identity}] of Object.entries(frozen.cases)){
 let actual;try{actual={ok:true,value:engine.inspectCoreReferenceLinks(source,identity)}}catch(error){actual={ok:false,error:{code:error.code??'',message:error.message??String(error),path:error.path??''}}}
 assert.equal(JSON.stringify(actual),JSON.stringify(frozen.outcomes[name]),name);actuals[name]=actual;console.log(`${name}: exact match`);
}
const root=resolve(new URL('../../../',import.meta.url).pathname),addon=new Uint8Array(await readFile(resolve(root,'bindings/core/node/umf_core_node.node'))),packet=new Uint8Array(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/frozen-typescript.json')));
const pinnedPaths=['crates/umf-core/src/reference_links_inspection.rs','crates/umf-core/src/lib.rs','crates/umf-core-wire/src/lib.rs','bindings/core/node/src/core-model.js','bindings/core/node/src/wire.js','bindings/core/node/src/lib.rs','bindings/core/node/Cargo.toml','Cargo.lock','scripts/rust-migration/r5/reference-links-inspection-parity.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(pinnedPaths.map(async path=>[path,createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')])));
const receipt={status:'pass',runtime:typeof Bun==='undefined'?'node':'bun',bunVersion:typeof Bun==='undefined'?null:Bun.version,nodeCompatibilityVersion:process.version,target:'aarch64-apple-darwin',cargoProfile:'release',rustc:'1.90.0 (1159e78c4 2025-09-14)',cargo:'1.90.0 (840b83a10 2025-07-30)',cases:Object.keys(actuals).length,addonSha256:createHash('sha256').update(addon).digest('hex'),frozenTypescriptSha256:createHash('sha256').update(packet).digest('hex'),sourceHashes,actual:actuals};
await writeFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r5-reference-links-inspection/node.json'),JSON.stringify(receipt,null,2)+'\n');

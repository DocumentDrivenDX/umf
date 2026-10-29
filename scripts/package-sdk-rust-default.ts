// SPDX-License-Identifier: MIT OR Apache-2.0
// Source-built R7 SDK archive. It uses a private build tree and never reuses
// checked-in or prior target artifacts.
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,readdir,rename,rm,symlink,writeFile} from 'node:fs/promises';
import {basename,join,relative,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import type {BunPlugin} from 'bun';
import {checkCoreDistribution} from './check-core-authority';
import {rustCompileResources} from './metamodel/source-closure';
import {assertSameSourceInventory} from './rust-migration/r8/source-inventory.mjs';
import {copySourceSnapshotFile} from './rust-migration/r8/copy-source-snapshot';

const workspaceRoot=process.cwd();
let root=workspaceRoot;
const buildOnly=process.env.UMF_RUST_DEFAULT_BUILD_ONLY==='1';
const publishDist=resolve(process.env.UMF_RUST_DEFAULT_DIST??join(workspaceRoot,'dist'));
if(!buildOnly)throw new Error('This source builder does not create archives; use scripts/package-sdk.ts for the canonical SDK archive');
const scratch=await mkdtemp(join(tmpdir(),'umf-rust-sdk-default-'));
const dist=join(scratch,'package','dist');
const cargoTarget=join(scratch,'cargo-target');
const wasmOut=join(scratch,'wasm-bindgen');
const packageRoot=join(scratch,'package');

async function run(command:string[],options:{cwd?:string;env?:Record<string,string|undefined>}={}){
 const child=Bun.spawn(command,{cwd:options.cwd??root,env:{...process.env,...options.env},stdout:'inherit',stderr:'inherit'});
 const code=await child.exited;
 if(code!==0)throw new Error(`Command failed (${code}): ${command.join(' ')}`);
}
async function capture(command:string[]){
 const child=Bun.spawn(command,{cwd:root,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 const code=await child.exited;
 if(code!==0)throw new Error(`${command.join(' ')} failed (${code}): ${stderr}`);
 return stdout.trim();
}
async function filesUnder(dir:string):Promise<string[]>{
 const output:string[]=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);
  if(entry.isDirectory())output.push(...await filesUnder(path));
  else if(entry.isFile())output.push(path);
 }
 return output;
}
async function sourceClosureFiles(dir:string,bindings=false):Promise<string[]>{
 const output:string[]=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  if(['target','node_modules','.git','__pycache__','.venv'].includes(entry.name))continue;
  const path=join(dir,entry.name);
  const relativePath=relative(workspaceRoot,path).split('\\').join('/');
  if(bindings&&( /(?:^|\/)wasm\/pkg(?:\/|$)/.test(relativePath)||/\.(?:node|so|dylib|dll|pyd|wasm|pyc)$/i.test(relativePath)))continue;
  if(entry.isDirectory())output.push(...await sourceClosureFiles(path,bindings));
  else if(entry.isFile())output.push(path);
 }
 return output;
}
const dynamicSourceRoots=[
 'crates','bindings','src','scripts/metamodel',
 'docs/helix/04-build/evidence/metamodel-authority','spec','native/postgresql',
 'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover','native/tablespec',
 'bindings/core/node/src','bindings/core/node/tests','bindings/core/wasm/src','bindings/core/wasm/tests',
];
function isDynamicSourcePath(baseRoot:string,file:string){
 const name=relative(baseRoot,file).split('\\').join('/');
 return dynamicSourceRoots.some(root=>name===root||name.startsWith(`${root}/`));
}
async function collectDynamicSourceInputs(baseRoot:string):Promise<string[]>{
 return [...new Set([
  ...await sourceClosureFiles(join(baseRoot,'crates')),
  ...await sourceClosureFiles(join(baseRoot,'bindings'),true),
  ...await filesUnder(join(baseRoot,'src')),
  ...await filesUnder(join(baseRoot,'bindings/core/node/src')),
  ...await filesUnder(join(baseRoot,'bindings/core/node/tests')),
  ...await filesUnder(join(baseRoot,'bindings/core/wasm/src')),
  ...await filesUnder(join(baseRoot,'bindings/core/wasm/tests')),
  ...await filesUnder(join(baseRoot,'scripts/metamodel')),
  ...await filesUnder(join(baseRoot,'docs/helix/04-build/evidence/metamodel-authority')),
  ...await filesUnder(join(baseRoot,'spec')),
  ...await filesUnder(join(baseRoot,'native/postgresql')),
  ...await filesUnder(join(baseRoot,'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover')),
  ...await filesUnder(join(baseRoot,'native/tablespec')),
 ])].sort();
}
async function digest(path:string){return createHash('sha256').update(await readFile(path)).digest('hex');}
async function treeDigest(paths:string[],baseRoot=workspaceRoot){
 const hash=createHash('sha256');
 for(const path of paths.sort()){
  hash.update(relative(baseRoot,path).split('\\').join('/'));hash.update('\0');hash.update(await readFile(path));hash.update('\0');
 }
 return hash.digest('hex');
}
async function inputHashes(paths:string[],baseRoot:string){
 const hashes:Record<string,string>={};
 for(const path of [...paths].sort())hashes[relative(baseRoot,path).split('\\').join('/')]=await digest(path);
 return hashes;
}
try{
 await mkdir(dist,{recursive:true});
 const rustc=await capture(['rustc','--version']);
 if(!rustc.startsWith('rustc 1.90.0 '))throw new Error(`SDK qualification requires rustc 1.90.0, got ${rustc}`);
 const cargoSourceFiles=[
  ...await sourceClosureFiles(join(root,'crates')),
  ...await sourceClosureFiles(join(root,'bindings'),true),
 ];
 const jsSourceFiles=[
  ...await filesUnder(join(root,'src')),
  ...await filesUnder(join(root,'bindings/core/node/src')),
  ...await filesUnder(join(root,'bindings/core/node/tests')),
  ...await filesUnder(join(root,'bindings/core/wasm/src')),
  ...await filesUnder(join(root,'bindings/core/wasm/tests')),
  join(root,'bindings/core/node/index.js'),
  join(root,'bindings/core/wasm/index.js'),
 ];
 const metamodelManifest=JSON.parse(await readFile(join(root,'spec/metamodel/generated/manifest.json'),'utf8'));
 // The separately owned accounted validator brings immutable predecessor
 // inputs and custody receipts into the build; copy the declared backend too.
 const metamodelBackendInputs=Object.keys(metamodelManifest.backend.inputs).map(path=>join(root,path));
 const sourceInputs=[...new Set([
  ...metamodelBackendInputs,
  join(root,'Cargo.lock'),join(root,'Cargo.toml'),join(root,'rust-toolchain.toml'),join(root,'package.json'),join(root,'bun.lock'),join(root,'tsconfig.json'),
  join(root,'bindings/core/node/index.js'),join(root,'bindings/core/wasm/index.js'),
  join(root,'bindings/core/node/index.d.ts'),join(root,'bindings/core/wasm/index.d.ts'),
  join(root,'bindings/core/node/package.json'),join(root,'bindings/core/wasm/package.json'),
  join(root,'.cargo/config.toml'),
  join(root,'.github/workflows/rust-sdk-default-qualification.yml'),
  join(root,'scripts/package-sdk-rust-default.ts'),join(root,'scripts/test-sdk-rust-default.ts'),
  join(root,'scripts/check-unified-client-boundaries.ts'),
  join(root,'tests/unified-client-boundaries.test.ts'),
  join(root,'scripts/rust-migration/r8/copy-source-snapshot.ts'),
  join(root,'scripts/rust-migration/r8/copy-source-snapshot.test.ts'),
  join(root,'scripts/rust-migration/r8/source-inventory.mjs'),join(root,'scripts/rust-migration/r8/source-inventory.d.mts'),join(root,'scripts/rust-migration/r8/source-inventory.test.mjs'),
  join(root,'scripts/rust-migration/r8/v4-default-facade.mjs'),join(root,'scripts/rust-migration/r8/v4-default-facade.test.js'),
  join(root,'scripts/rust-migration/r8/relationship-consumers-installed.mjs'),
  join(root,'scripts/rust-migration/r8/security-and-or-v4-source-replay.mjs'),
  join(root,'scripts/rust-migration/r8/compact-dataset-verify-v4-source-replay.mjs'),
  join(root,'scripts/rust-migration/r8/compact-dataset-verify-installed-diagnostic.mjs'),
  join(root,'scripts/rust-migration/r8/capture-default-route-cohort.mjs'),
  join(root,'scripts/rust-migration/r8/aggregate-default-route-cohorts.mjs'),
  join(root,'scripts/rust-migration/r8/csv-boolean-default-retirement-packets.ts'),
  join(root,'scripts/rust-migration/r8/csv-boolean-default-retirement-replay-node.mjs'),
  join(root,'scripts/rust-migration/r8/csv-boolean-default-retirement-replay-browser.mjs'),
  join(root,'scripts/rust-migration/r8/security-and-or-installed-replay.mjs'),
  join(root,'scripts/rust-migration/r8/relationships-default-retirement-packets.ts'),
  join(root,'scripts/rust-migration/r8/relationships-default-retirement-replay-node.mjs'),
  join(root,'scripts/rust-migration/r8/relationships-default-retirement-replay-browser.mjs'),
  join(root,'scripts/rust-migration/r8/relationships-default-retirement-receipts-check.mjs'),
  join(root,'scripts/rust-migration/r8/relationships-default-retirement-pins.py'),
  join(root,'scripts/rust-migration/r8/bit128-field-installed.mjs'),
  join(root,'scripts/rust-migration/r8/bit128-field-installed-host.ts'),
  join(root,'scripts/rust-migration/r8/bit128-field-installed-browser.ts'),
  join(root,'scripts/rust-migration/r8/avro-document-installed-probe.mjs'),
  join(root,'scripts/rust-migration/r8/avro-document-installed-host.mjs'),
  join(root,'scripts/rust-migration/r8/avro-document-installed-browser.mjs'),
  join(root,'scripts/rust-migration/r8/avro-document-installed.mjs'),
  join(root,'tests/rust-migration/r8-avro-document-installed-probe.test.mjs'),
  join(root,'scripts/rust-migration/r8/core-facets-current-installed.mjs'),
  join(root,'scripts/rust-migration/r8/core-facets-dependency-installed.mjs'),
  join(root,'scripts/rust-migration/r8/core-facets-dependency-installed-replay.mjs'),
  join(root,'scripts/rust-migration/r8/core-facets-installed-asset-controls.mjs'),
  join(root,'scripts/rust-migration/r8/core-facets-resource-suite.mjs'),
  join(root,'scripts/rust-migration/r8/core-facets-resource-source-preflight.mjs'),
  join(root,'scripts/rust-migration/r8/core-facets-dependency-installed.test.mjs'),
  join(root,'scripts/rust-migration/r8/qualify-core-facets-linux-local.sh'),
  join(root,'scripts/rust-migration/r5/compact-current-work-oracle.ts'),
  join(root,'tests/rust-core/fixtures/parquet-metadata-ts-freeze.json'),
  join(root,'fixtures/parquet/rename/none.parquet'),
  join(root,'fixtures/parquet/rust-migration/list-tuple-capture-inspection.expected.json'),
  join(root,'fixtures/parquet/rust-migration/unknown-footer-inspection.expected.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-parquet-metadata-operations/README.md'),
  join(root,'docs/helix/02-design/contracts/CONTRACT-019-parquet.md'),
  join(root,'tests/rust-migration/r8-core-facets-current-installed.test.mjs'),
  join(root,'tests/rust-migration/r8-core-facets-facade-prereq.test.ts'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-core-facets-installed/replay-installed.mjs'),
  ...['frozen-typescript.json','meaning-cases.json','regression-cases.json','exact-errors.json']
    .map(name=>join(root,`docs/helix/04-build/evidence/rust-migration/r5-core-facets/${name}`)),
  join(root,'fixtures/avro/candidate-edits.json'),
  join(root,'scripts/rust-migration/r8/arrow-schema-v4-route-replay.mjs'),
  join(root,'scripts/rust-migration/r8/arrow-schema-v4-chromium-replay.mjs'),
  join(root,'scripts/rust-migration/r8/inspectors-default-retirement-packets.ts'),
  join(root,'scripts/rust-migration/r8/inspectors-default-retirement-replay-node.mjs'),
  join(root,'scripts/rust-migration/r8/inspectors-default-retirement-replay-browser.mjs'),
  join(root,'scripts/rust-migration/r8/default-route-retirement-evidence.mjs'),
  join(root,'scripts/rust-migration/r8/default-route-retirement-evidence.test.mjs'),
  join(root,'scripts/rust-migration/r8/facets-retirement-packets/build-packets.mjs'),
  join(root,'scripts/rust-migration/r8/facets-retirement-packets/expanded-cases.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-core-facets-retirement-packets/README.md'),
  ...['inspectCoreFacets','declareCoreFacets','verifyCoreFacetDeclaration','historicalCoreFacetPatch']
    .map(name=>join(root,`scripts/rust-migration/r8/facets-retirement-packets/${name}.packet.json`)),
  join(root,'scripts/rust-migration/r8/security-not-retirement-packet.json'),
  join(root,'scripts/rust-migration/r8/security-not-retirement-replay-node.mjs'),
  join(root,'scripts/rust-migration/r8/security-not-retirement-replay-browser.mjs'),
  join(root,'scripts/rust-migration/r8/core-cardinality-case-capture.mjs'),
  join(root,'scripts/rust-migration/r8/core-cardinality-case-capture.test.mjs'),
  join(root,'scripts/rust-migration/r8/cardinality-retirement-packets/README.md'),
  ...['inspectCoreCardinality','declareCoreCardinality','verifyCoreCardinalityDeclaration']
    .map(name=>join(root,`scripts/rust-migration/r8/cardinality-retirement-packets/${name}.packet.json`)),
  join(root,'scripts/rust-migration/r8/gap-ledger.mjs'),join(root,'scripts/rust-migration/r8/gap-ledger.test.mjs'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/README.md'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-symbol-inventory/inventory.json'),
  // The generated gap ledger is post-build attestation: retirement records pin
  // this archive's source digest. Including its output would create a hash cycle.
  // Keep its inventory, generator and tests above as qualification inputs.
  ...['common','host','host-child','chromium'].map(name=>join(root,`scripts/rust-migration/r8/schema-graph-route-${name}.mjs`)),
  ...['schema-graph-route-build-packet.mjs','schema-graph-route-evidence.mjs','schema-graph-route-evidence.test.mjs']
    .map(name=>join(root,`scripts/rust-migration/r8/${name}`)),
  ...['loader-inspector-host.mjs','loader-inspector-host-child.mjs','loader-inspector-chromium.mjs','loader-inspector-route-build-packet.mjs','loader-inspector-route-evidence.mjs']
    .map(name=>join(root,`scripts/rust-migration/r8/${name}`)),
  ...['domain-pack-profile-cases.json','domain-pack-profile-cases.mjs','domain-pack-profile-host-child.mjs','domain-pack-profile-host.mjs','domain-pack-profile-chromium.mjs','domain-pack-profile-route-evidence.mjs','domain-pack-profile-route-build-packet.mjs','domain-pack-profile-route-evidence.test.mjs']
    .map(name=>join(root,`scripts/rust-migration/r8/${name}`)),
  // R8 Arrow IPC/schema qualification is source-pinned independently of the
  // dynamic src/bindings trees: these scripts, focused tests and frozen
  // predecessor/evidence packets are the qualification inputs.
  ...['arrow-ipc-v4-chromium-smoke.mjs','freeze-arrow-ipc-host-boundary.mjs','arrow-schema-installed-package.mjs','arrow-schema-installed-package-support.mjs',
    'arrow-ipc-installed-package.mjs','arrow-ipc-installed-support.mjs','arrow-ipc-installed-replay.mjs','arrow-ipc-installed-chromium.mjs']
    .map(name=>join(root,`scripts/rust-migration/r8/${name}`)),
  join(root,'tests/rust-core/arrow-ipc-v4-default.test.mjs'),
  join(root,'tests/rust-core/arrow-schema-bindings.test.mjs'),
  join(root,'tests/rust-migration/r8-arrow-schema-installed-package.test.mjs'),
  join(root,'tests/rust-migration/r8-arrow-ipc-installed-gate.test.mjs'),
  join(root,'docs/helix/02-design/contracts/CONTRACT-016-arrow.md'),
  ...[
    'r8-arrow-ipc-host-boundary-20261028/README.md',
    'r8-arrow-ipc-host-boundary-20261028/typescript-arrow-ipc-host-boundary.json.gz',
    'r8-arrow-ipc-v4-default-20261028/README.md',
    'r8-arrow-schema-v4-candidate-20261028/README.md',
  ].map(name=>join(root,`docs/helix/04-build/evidence/rust-migration/${name}`)),
  // The Protobuf descriptor/document Rust candidate has separate frozen
  // predecessor, qualification, installed-package, and replay inputs.
  ...[
    'capture-protobuf-descriptor-predecessor.ts',
    'protobuf-descriptor-candidate-installed.mjs',
    'protobuf-descriptor-document-browser-probe.mjs',
    'protobuf-descriptor-document-host-probe.mjs',
    'protobuf-descriptor-document-installed.mjs',
    'protobuf-descriptor-document-qualification-core.mjs',
    'protobuf-descriptor-document-replay.mjs',
  ].map(name=>join(root,`scripts/rust-migration/r8/${name}`)),
  ...[
    'protobuf-document-bindings.test.mjs',
    'protobuf-document-browser.mjs',
    'protobuf-read-descriptor-candidate.test.mjs',
    'protobuf-read-descriptor-predecessor.json',
    'protobuf-rust-default.test.mjs',
    'protobuf-v4-default.test.mjs',
    'protobuf-v4-browser.test.mjs',
  ].map(name=>join(root,`tests/rust-core/${name}`)),
  join(root,'tests/rust-migration/r8-protobuf-descriptor-document-qualification-core.test.mjs'),
  join(root,'tests/rust-migration/r8-protobuf-descriptor-predecessor.test.mjs'),
  join(root,'docs/helix/02-design/contracts/CONTRACT-003-protobuf.md'),
  ...[
    'r8-core-nine-installed-current/README.md',
    'r8-protobuf-descriptor-candidate-installed/README.md',
    'r8-protobuf-descriptor-candidate-installed/darwin-arm64-sdk-receipt.json',
    'r8-protobuf-descriptor-document/README.md',
    'r8-protobuf-descriptor-document/sol-review.md',
    'r8-protobuf-descriptor-document-installed/README.md',
    'r8-protobuf-descriptor-predecessor/README.md',
    'r8-protobuf-descriptor-predecessor/predecessor.json',
    'r8-protobuf-descriptor-predecessor/source-cohort.json',
  ].map(name=>join(root,`docs/helix/04-build/evidence/rust-migration/${name}`)),
  // Keep the current core-nine default-retirement harness and installed
  // receipt tied to the archive even though its implementation is in src.
  join(root,'scripts/rust-migration/r8/core-nine-default-retirement.mjs'),
  ...['core-nine-installed-consumer.mjs','core-nine-installed-support.mjs',
    'core-nine-installed-support.test.mjs','schema-properties-installed.mjs']
    .map(name=>join(root,`scripts/rust-migration/r8/${name}`)),
  // The next Avro slice currently freezes only its TypeScript predecessor.
  // It is captured with this source cut without claiming a Rust default route.
  join(root,'scripts/rust-migration/r8/capture-avro-inspect-edit-predecessor.ts'),
  join(root,'tests/rust-migration/r8-avro-inspect-edit-predecessor.test.mjs'),
  join(root,'tests/rust-migration/r8-avro-inspect-edit-differential.test.mjs'),
  join(root,'docs/helix/02-design/contracts/CONTRACT-007-avro.md'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-avro-inspect-edit-predecessor/README.md'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-avro-inspect-edit-predecessor/predecessor.json'),
  join(root,'scripts/core-relationship-cases.ts'),join(root,'scripts/core-relationship-operation-cases.ts'),
  join(root,'docs/helix/02-design/contracts/CONTRACT-041-relationship.md'),
  join(root,'docs/helix/02-design/contracts/CONTRACT-053-domain-pack-profiles.md'),
  join(root,'docs/helix/02-design/contracts/CONTRACT-001-core-envelope.md'),
  join(root,'docs/helix/02-design/contracts/CONTRACT-040-core-ideals.md'),
  join(root,'docs/helix/02-design/contracts/CONTRACT-062-security-semantics.md'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/predecessor.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-security-and-or-v4-source-replay/predecessor.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-compact-dataset-verify-source/index.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-compact-dataset-verify-source/index-current.json'),
  ...['commerce-complete','stale-source-input-canonical-skipped','stale-source-expected-input-copy-limit','near-limit-accepted','near-limit-first-refused']
    .map(name=>join(root,`docs/helix/04-build/evidence/rust-migration/r8-compact-dataset-verify-source/frozen-${name}.json`)),
  join(root,'docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/current-5e7138383-20261026/core-inspectors-host-node-bun.json'),
  ...['inspectCoreScalarType','inspectCoreRecordMembers','inspectCoreReferenceLinks']
    .map(name=>join(root,`docs/helix/04-build/evidence/rust-migration/r8-inspectors-default-retirement-replay/${name}.packet.json`)),
  ...['inspectCoreRelationships','lookupCoreRelationship','declareCoreRelationship','verifyCoreRelationshipOperation']
    .map(name=>join(root,`docs/helix/04-build/evidence/rust-migration/r8-relationships-default-retirement-replay/${name}.packet.json`)),
  join(root,'docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-retirement-replay/README.md'),
  ...['validateCsvBooleanLexical','verifyCsvBooleanLexical','validateCoreRecordValues']
    .map(name=>join(root,`docs/helix/04-build/evidence/rust-migration/r8-csv-boolean-default-retirement-replay/${name}.packet.json`)),
  join(root,'scripts/rust-migration/r5/freeze-core-keys-default.ts'),
  join(root,'scripts/rust-migration/r5/bit128-default-route/freeze.ts'),
  join(root,'scripts/rust-migration/r5/bit128-default-route/predecessor.json'),
  join(root,'tests/bit128.test.ts'),join(root,'tests/uuid.test.ts'),
  join(root,'docs/helix/02-design/contracts/CONTRACT-076-128-bit-uuid.md'),
  join(root,'scripts/test-sdk-install.ts'),
  join(root,'scripts/package-sdk.py'),
  join(root,'scripts/test-sdk-package.py'),
  join(root,'scripts/metamodel/build.ts'),join(root,'scripts/actions-plan-identity.ts'),join(root,'scripts/build.ts'),join(root,'scripts/package-sdk.ts'),
  join(root,'scripts/check-metamodel-self.ts'),...await filesUnder(join(root,'scripts/metamodel')),
  join(root,'scripts/build-postgresql.ts'),join(root,'scripts/check-core-authority.ts'),
  ...await filesUnder(join(root,'docs/helix/04-build/evidence/metamodel-authority')),
  join(root,'README.md'),join(root,'LICENSE.md'),join(root,'LICENSE-MIT'),join(root,'LICENSE-APACHE'),
  join(root,'tests/access-host-read-v4.test.ts'),join(root,'tests/rust-codegen-default-v4.test.ts'),
  join(root,'scripts/test-rust-codegen-host-read-v4-node.ts'),join(root,'scripts/test-rust-codegen-host-read-v4-browser.ts'),
  ...cargoSourceFiles,...jsSourceFiles,...await filesUnder(join(root,'spec')),
  ...await filesUnder(join(root,'native/postgresql')),
  join(root,'tests/unified/commerce.json'),
  join(root,'python/umf_access/src/umf_access/generated_core.py'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r5-model-bindings/frozen-cardinality-typescript.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r5-core-facets/regression-cases.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r5-core-keys-default-route/frozen-typescript.json'),
  ...await filesUnder(join(root,'docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover')),
  join(root,'docs/helix/02-design/spikes/security/policy-v0.2.schema.json'),
  ...await filesUnder(join(root,'native/tablespec')),
 ])].sort();
 // The metamodel generator attests its own compiler/workspace closure. Ensure
 // every file it declares is represented in this builder's immutable snapshot
 // so private regeneration cannot quietly omit an input and appear stale.
 const sourceInputSet=new Set(sourceInputs);
 const declaredMetamodelInputs=[
  ...metamodelBackendInputs,
  join(root,'Cargo.toml'),join(root,'Cargo.lock'),join(root,'rust-toolchain.toml'),join(root,'.cargo/config.toml'),
  join(root,'spec/metamodel/umf.yaml'),...rustCompileResources.map(path=>join(root,path)),
  ...await sourceClosureFiles(join(root,'crates')),
  ...await sourceClosureFiles(join(root,'bindings'),true),
  ...await filesUnder(join(root,'scripts/metamodel')),
  join(root,'src/validation/json-equality.ts'),join(root,'bindings/core/node/src/wire.js'),
  join(root,'package.json'),join(root,'bun.lock'),
 ];
 const missingMetamodelInputs=declaredMetamodelInputs.filter(path=>!sourceInputSet.has(path));
 if(missingMetamodelInputs.length)throw new Error(`SDK_SOURCE_CLOSURE missing metamodel builder inputs: ${missingMetamodelInputs.map(path=>relative(workspaceRoot,path)).join(', ')}`);
 // build-postgresql.ts copies this locked package resource byte-for-byte into
 // dist. It lives behind node_modules (which is linked into the private
 // snapshot), so pin it separately from repository-owned source files.
 const externalInputs=[join(root,'node_modules/@libpg-query/parser/wasm/libpg-query.wasm')];
 let externalInputHashes=await inputHashes(externalInputs,workspaceRoot);
 const snapshotRoot=join(scratch,'source-snapshot');
 let sourceInputHashes:Record<string,string>={};
 let sourceHash='';
 let snapshotInputs:string[]=[];
 let captured=false;
 for(let attempt=1;attempt<=3&&!captured;attempt++){
  sourceInputHashes=await inputHashes(sourceInputs,workspaceRoot);
  sourceHash=await treeDigest(sourceInputs,workspaceRoot);
  await rm(snapshotRoot,{recursive:true,force:true});
  await mkdir(snapshotRoot,{recursive:true});
  snapshotInputs=[];
  for(const source of sourceInputs){
   const name=relative(workspaceRoot,source);
   const target=join(snapshotRoot,name);
   await mkdir(join(target,'..'),{recursive:true});
   await copySourceSnapshotFile(source,target);
   snapshotInputs.push(target);
  }
  const liveAfterCopy=await inputHashes(sourceInputs,workspaceRoot);
  const copied=await inputHashes(snapshotInputs,snapshotRoot);
  captured=JSON.stringify(sourceInputHashes)===JSON.stringify(liveAfterCopy)&&JSON.stringify(sourceInputHashes)===JSON.stringify(copied);
  const externalAfterCopy=await inputHashes(externalInputs,workspaceRoot);
  captured=captured&&JSON.stringify(externalInputHashes)===JSON.stringify(externalAfterCopy);
  if(!captured&&attempt===3)throw new Error('Could not capture a stable source snapshot after three attempts');
 }
 await symlink(join(workspaceRoot,'node_modules'),join(snapshotRoot,'node_modules'),'dir');
 if(await treeDigest(snapshotInputs,snapshotRoot)!==sourceHash)throw new Error('Snapshot source closure hash mismatch');
 const capturedLiveSourceHash=sourceHash;
 const capturedLiveInputHashes={...sourceInputHashes};
 root=snapshotRoot;
 process.chdir(snapshotRoot);

 await run([process.execPath,'scripts/rust-migration/r8/v4-default-facade.mjs','--check']);
 const cargoEnv={CARGO_TARGET_DIR:cargoTarget};
 await run([process.execPath,'scripts/metamodel/build.ts'],{env:cargoEnv});
 await run([process.execPath,'scripts/actions-plan-identity.ts']);
 const capturedSourcePaths=sourceInputs.map(path=>relative(workspaceRoot,path).split('\\').join('/'));
 const capturedDynamicPaths=new Set(sourceInputs.filter(path=>isDynamicSourcePath(workspaceRoot,path)).map(path=>relative(workspaceRoot,path).split('\\').join('/')));
 const staticSourcePaths=capturedSourcePaths.filter(path=>!capturedDynamicPaths.has(path));
 const generatedDynamicPaths=(await collectDynamicSourceInputs(snapshotRoot)).map(path=>relative(snapshotRoot,path).split('\\').join('/'));
 assertSameSourceInventory(
  [...staticSourcePaths,...capturedDynamicPaths],
  [...staticSourcePaths,...generatedDynamicPaths],
  'Source input path set after snapshot generators',
 );
 const generatedInputs=new Set(['spec/core/schema.json','spec/core/semantic-type-reference.schema.json','spec/core/extension-package.schema.json','spec/metamodel/package.json','spec/metamodel/generated/core-constraints.json','spec/metamodel/generated/domain-policy.json','spec/metamodel/generated/python-shapes.json','spec/metamodel/generated/manifest.json','src/generated/core-model.ts','src/generated/core-validators.ts','src/extensions/actions/plan-identity.ts','python/umf_access/src/umf_access/generated_core.py']);
 const derivedHashes=await inputHashes(snapshotInputs,snapshotRoot);
 for(const [path,hash] of Object.entries(sourceInputHashes))if(!generatedInputs.has(path)&&derivedHashes[path]!==hash)throw new Error(`Source snapshot changed outside generated inputs: ${path}`);
 const sourceTransform={status:Object.entries(capturedLiveInputHashes).some(([path,hash])=>generatedInputs.has(path)&&derivedHashes[path]!==hash)?'derived-private-snapshot-not-release-fixed-point':'fixed-point',generatedInputs:[...generatedInputs].sort().map(path=>({path,before:capturedLiveInputHashes[path],after:derivedHashes[path]})).filter(item=>item.before!==item.after)};
 sourceInputHashes=derivedHashes;
 sourceHash=await treeDigest(snapshotInputs,snapshotRoot);
 await run(['cargo','build','--release','--locked','--manifest-path','bindings/core/wasm/Cargo.toml','--target','wasm32-unknown-unknown'],{env:cargoEnv});
 const bindgen=Bun.spawn(['wasm-bindgen','--version'],{stdout:'pipe',stderr:'pipe'});
 const bindgenVersion=await new Response(bindgen.stdout).text();
 const bindgenError=await new Response(bindgen.stderr).text();
 if(await bindgen.exited!==0||bindgenVersion.trim()!=='wasm-bindgen 0.2.100')throw new Error(`Expected wasm-bindgen 0.2.100, got ${(bindgenVersion+bindgenError).trim()}`);
 await run(['wasm-bindgen','--target','web','--out-dir',wasmOut,'--out-name','umf_core_wasm',join(cargoTarget,'wasm32-unknown-unknown/release/umf_core_wasm.wasm')]);
 await mkdir(join(root,'bindings/core/wasm/pkg'),{recursive:true});
 await cp(join(wasmOut,'umf_core_wasm.js'),join(root,'bindings/core/wasm/pkg/umf_core_wasm.js'));
 await cp(join(wasmOut,'umf_core_wasm.d.ts'),join(root,'bindings/core/wasm/pkg/umf_core_wasm.d.ts'));
 await run([process.execPath,'scripts/build-postgresql.ts']);
 await run([process.execPath,'node_modules/typescript/bin/tsc','--emitDeclarationOnly','--outDir',dist]);
 await cp(join(root,'spec'),join(dist,'spec'),{recursive:true});
 await cp(join(root,'dist/postgresql'),join(dist,'postgresql'),{recursive:true});
 await cp(join(wasmOut,'umf_core_wasm.js'),join(dist,'umf_core_wasm.js'));
 await cp(join(wasmOut,'umf_core_wasm.d.ts'),join(dist,'umf_core_wasm.d.ts'));
 const legacyBuild=await Bun.build({entrypoints:['src/index.ts'],outdir:dist,naming:'umf.js',target:'browser',format:'esm',sourcemap:'external'});
 if(!legacyBuild.success)throw new Error(legacyBuild.logs.join('\n'));
 const loaderBuild=await Bun.build({entrypoints:['src/domain-packs/loader-contract.ts'],outdir:dist,naming:'loader-contract.js',target:'browser',format:'esm'});
 if(!loaderBuild.success)throw new Error(loaderBuild.logs.join('\n'));

 const host=process.platform==='darwin'?'darwin':process.platform;
 const arch=process.arch;
 if(!((host==='darwin'&&arch==='arm64')||(host==='linux'&&arch==='x64')))throw new Error(`Unsupported SDK native cohort: ${host}-${arch}`);
 await run(['cargo','build','--release','--locked','--manifest-path','bindings/core/node/Cargo.toml'],{env:cargoEnv});
 const archId=arch==='x64'?'x86_64':arch==='arm64'?'aarch64':arch;
 const packageVersion=(JSON.parse(await readFile(join(root,'package.json'),'utf8')) as {version:string}).version;
 const targetDir=join(cargoTarget,'release');
 const nativeCandidates=await filesUnder(targetDir);
 const native=nativeCandidates.find(path=>basename(path)===(host==='darwin'?'libumf_core_node.dylib':'libumf_core_node.so'));
 if(!native)throw new Error('Cargo did not produce the Node N-API cdylib');
 await cp(native,join(dist,'umf_core_node.node'));

 // The browser root bundle inlines the generated wasm-bindgen glue; its
 // import.meta.url therefore resolves the binary beside that root bundle.
 await cp(join(wasmOut,'umf_core_wasm_bg.wasm'),join(dist,'umf_core_wasm_bg.wasm'));
 const freshWasmImports=new Set<string>();
 const wasmPlugin:BunPlugin={name:'fresh-built-wasm-glue',setup(build){build.onResolve({filter:/umf_core_wasm\.js$/},args=>{
  if(args.importer.endsWith('bindings/core/wasm/index.js')&&args.path==='./pkg/umf_core_wasm.js'){
   freshWasmImports.add('wasm-index');return {path:join(wasmOut,'umf_core_wasm.js')};
  }
  if(args.importer.endsWith('src/index-browser-v4.ts')&&args.path==='../bindings/core/wasm/pkg/umf_core_wasm.js'){
   freshWasmImports.add('browser-root');return {path:join(wasmOut,'umf_core_wasm.js')};
  }
  return undefined;
 })}};
 const builds=[
  await Bun.build({entrypoints:['src/index-node-v4.ts'],outdir:dist,naming:'umf-node.js',target:'node',format:'esm'}),
  await Bun.build({entrypoints:['src/index-browser-v4.ts'],outdir:dist,naming:'umf-browser.js',target:'browser',format:'esm',plugins:[wasmPlugin]}),
  await Bun.build({entrypoints:['src/node.ts'],outdir:dist,naming:'umf-rust-codegen-candidate-v2-node.js',target:'node',format:'esm'}),
  await Bun.build({entrypoints:['src/browser.ts'],outdir:dist,naming:'umf-rust-codegen-candidate-v2-browser.js',target:'browser',format:'esm',plugins:[wasmPlugin]}),
  await Bun.build({entrypoints:['src/node-v3.ts'],outdir:dist,naming:'umf-rust-codegen-candidate-v3-node.js',target:'node',format:'esm'}),
  await Bun.build({entrypoints:['src/browser-v3.ts'],outdir:dist,naming:'umf-rust-codegen-candidate-v3-browser.js',target:'browser',format:'esm',plugins:[wasmPlugin]}),
  await Bun.build({entrypoints:['src/node-v4.ts'],outdir:dist,naming:'umf-rust-codegen-candidate-v4-node.js',target:'node',format:'esm'}),
  await Bun.build({entrypoints:['src/browser-v4.ts'],outdir:dist,naming:'umf-rust-codegen-candidate-v4-browser.js',target:'browser',format:'esm',plugins:[wasmPlugin]}),
 ];
 for(const build of builds)if(!build.success)throw new Error(build.logs.join('\n'));
 if(!freshWasmImports.has('browser-root')||!freshWasmImports.has('wasm-index'))throw new Error('Browser bundles did not consume the fresh wasm-bindgen glue through both direct root and WASM adapter imports');
 await checkCoreDistribution(dist);

 const compiled=[...await filesUnder(dist)].sort();
 if(await treeDigest(snapshotInputs,snapshotRoot)!==sourceHash)throw new Error('Build input source closure changed during package creation');
 const manifest={
  format:'umf.r7-rust-sdk-default/1',
  releaseStatus:sourceTransform.status==='fixed-point'?'private-r7-default-route-qualification-not-publishable':'private-r7-default-route-qualification-source-drift-not-publishable',
  profile:'umf.python-client-host-read/4',
  defaultRouteSource:'V4 synchronous Rust root entry selected by package.json for the supported native and browser hosts',
  packageVersion,
  platform:{os:host,arch:archId,nodeArch:arch,nativeTarget:host==='darwin'?'aarch64-apple-darwin':'x86_64-unknown-linux-gnu',napi:'N-API 8',runtimeCohort:['Node','Bun']},
  resources:{count:9,identity:'fixed-repository-owned'},
  limits:{recordPositions:10000,actionPositions:1000,selectedIdentityUtf16Units:4000000},
  api:{entry:'.',reference:'./reference',moduleLoad:'top-level-await-initialization',generator:'synchronous'},
  toolchain:{rustc,cargo:await capture(['cargo','--version']),bun:Bun.version,wasmBindgen:'0.2.100',cargoLockSha256:await digest(join(root,'Cargo.lock'))},
  sourceClosure:{sha256:sourceHash,capturedLiveSha256:capturedLiveSourceHash,transform:sourceTransform,coverage:'Repository source closure includes Rust crates, core Node/WASM/Python binding source and Node/WASM binding tests, TypeScript source, schemas, fixture/corpus inputs, builder/test scripts, metamodel compiler closure and authority evidence. The source-pinned installed replay script and package-verifier tests are included. The exact @libpg-query WASM package resource copied by build-postgresql.ts is separately SHA-256 pinned as an external input. Lockfiles/toolchain versions identify dependency and tool resolution; installed host runtimes/browser are reported by the replay receipt. The model metamodel and action identity generators run only in the private snapshot; transform records all changed generated inputs. Any non-fixed-point result is explicitly non-release.',fileCount:sourceInputs.length,liveInputs:capturedLiveInputHashes,inputs:sourceInputHashes,externalInputs:externalInputHashes},
  assets:Object.fromEntries(await Promise.all(compiled.map(async path=>[relative(packageRoot,path).split('\\').join('/'),await digest(path)]))),
 };
 await writeFile(join(dist,'rust-default-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 {
  const live=await inputHashes(sourceInputs,workspaceRoot);
  if(JSON.stringify(live)!==JSON.stringify(capturedLiveInputHashes)){
   const changed=Object.keys(capturedLiveInputHashes).filter(path=>live[path]!==capturedLiveInputHashes[path]);
   throw new Error(`Live build inputs changed while Rust SDK assets were compiling: ${changed.join(', ')}`);
  }
  const externalLive=await inputHashes(externalInputs,workspaceRoot);
  if(JSON.stringify(externalLive)!==JSON.stringify(externalInputHashes)){
   const changed=Object.keys(externalInputHashes).filter(path=>externalLive[path]!==externalInputHashes[path]);
   throw new Error(`External build inputs changed while Rust SDK assets were compiling: ${changed.join(', ')}`);
  }
  for(const [path,hash] of Object.entries(manifest.assets))if(await digest(join(packageRoot,path))!==hash)throw new Error(`Staged SDK asset hash mismatch: ${path}`);
  const nonce=randomUUID();
  const staged=join(workspaceRoot,`.dist-rust-stage-${nonce}`);
  const backup=join(workspaceRoot,`.dist-rust-backup-${nonce}`);
  await cp(dist,staged,{recursive:true});
  let movedOld=false;
  try{
   try{await rename(publishDist,backup);movedOld=true}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error}
   await rename(staged,publishDist);
   if(movedOld)await rm(backup,{recursive:true,force:true});
  }catch(error){
   await rm(staged,{recursive:true,force:true});
   if(movedOld){await rm(publishDist,{recursive:true,force:true});await rename(backup,publishDist)}
   throw error;
  }
  console.log(JSON.stringify({status:'built',dist:publishDist,profile:manifest.profile,releaseStatus:manifest.releaseStatus,sourceTransformStatus:sourceTransform.status,sourceTransformCount:sourceTransform.generatedInputs.length,sourceTreeSha256:sourceHash,capturedLiveSourceTreeSha256:capturedLiveSourceHash,assetCount:Object.keys(manifest.assets).length}));
 }
}finally{await rm(scratch,{recursive:true,force:true});}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCoreFacetsRetirementPacket, requirePacketProfileForManifest, verifyPacket, verifyHostReceipt, verifyCoreFacetRetirementReceiptAgainstRaw, validateBoundedDefaultRouteEvidence, validateDefaultRouteRetirementEvidence } from './default-route-retirement-evidence.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const operation = {
  exportName: 'inspectCoreCardinality',
  rustOwner: 'umf_core::cardinality::inspect_core_cardinality',
  contract: { id: 'CONTRACT-040' },
};
const outcome = { status: 'returned', value: { cardinality: 'array' } };
const cases = [
  { id: 'known', input: { kind: 'known' }, expectedOutcome: outcome, expectedTrace: [], expectedDefaultRustCalls: 1 },
  { id: 'host-refusal', input: { kind: 'proxy' }, expectedOutcome: { status: 'threw', code: 'PROXY' }, expectedTrace: ['ownKeys'], expectedDefaultRustCalls: 1 },
];

test('derived retirement witnesses are bound to pinned raw packet observations',()=>{
 const hash='a'.repeat(64),packet={cases:new Map([['case-1',{id:'case-1'}]])};
 const row={id:'case-1',outcome:{status:'returned'},trace:[],ownShapeSha256:hash,rustOperations:['model/test']};
 const raw={observation:{packetEvidence:{default:{op:[row]},reference:{op:[{...row,rustOperations:[]}]}}}};
 const retirement={cases:[{id:'case-1',defaultOutcome:row.outcome,defaultTrace:[],defaultOwnShapeSha256:hash,defaultRustOperations:['model/test'],defaultRustCalls:1,referenceOutcome:row.outcome,referenceTrace:[],referenceOwnShapeSha256:hash,referenceRustCalls:0}]};
 assert.doesNotThrow(()=>verifyCoreFacetRetirementReceiptAgainstRaw(retirement,raw,'op',packet));
 for(const [label,change] of [
  ['shape',r=>{r.cases[0].defaultOwnShapeSha256='b'.repeat(64)}],
  ['outcome',r=>{r.cases[0].defaultOutcome={status:'threw'} }],
  ['dispatch',r=>{r.cases[0].defaultRustOperations=[]}],
 ]){const mutated=structuredClone(retirement);change(mutated);assert.throws(()=>verifyCoreFacetRetirementReceiptAgainstRaw(mutated,raw,'op',packet),/differs from pinned raw packet observation/,label)}
});
const packet = (contractId = 'CONTRACT-040') => ({ format: 'umf.r8.default-route-retirement-packet/2', profile: 'all-rust', contractId, exportName: operation.exportName, rustOwner: operation.rustOwner, cases: structuredClone(cases) });
const cohort = { id: 'darwin-arm64', platform: { os: 'darwin', nodeArch: 'arm64' }, archive: { sha256: 'a'.repeat(64), sourceClosureSha256: 'b'.repeat(64) } };
const members = { 'dist/umf-node.js': 'c'.repeat(64), 'dist/umf_core_node.node': 'd'.repeat(64), 'dist/umf.js': 'e'.repeat(64) };
const routes = { 'package-root-node': 'dist/umf-node.js', 'package-reference': 'dist/umf.js' };

async function pin(root, name, value) {
  const bytes = Buffer.from(JSON.stringify(value));
  await writeFile(path.join(root, name), bytes);
  return { path: name, sha256: sha(bytes) };
}

function receipt(packetSha256) {
  return {
    format: 'umf.r8.default-route-retirement-host-receipt/2', status: 'pass', runtime: 'node', hostVersion: 'fixture',
    cohortId: cohort.id, hostPlatform: { os: 'darwin', arch: 'arm64' }, archiveSha256: cohort.archive.sha256,
    sourceClosureSha256: cohort.archive.sourceClosureSha256, packetSha256,
    defaultRoute: { routeId: 'package-root-node', entryMember: 'dist/umf-node.js', entrySha256: members['dist/umf-node.js'], artifactMembers: [{ path: 'dist/umf_core_node.node', sha256: members['dist/umf_core_node.node'] }] },
    referenceRoute: { routeId: 'package-reference', entryMember: 'dist/umf.js', entrySha256: members['dist/umf.js'], artifactMembers: [] },
    cases: cases.map(item => ({ id: item.id, defaultOutcome: item.expectedOutcome, defaultTrace: item.expectedTrace, defaultRustCalls: 1, referenceOutcome: item.expectedOutcome, referenceTrace: item.expectedTrace, referenceRustCalls: 0 })),
  };
}

test('all-Rust Cardinality packets require exact case-level calls and a zero-Rust reference route', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-all-rust-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetPin = await pin(root, 'packet.json', packet());
  const verifiedPacket = verifyPacket(root, packetPin, operation);
  const good = receipt(packetPin.sha256);
  const goodPin = await pin(root, 'receipt.json', good);
  assert.doesNotThrow(() => verifyHostReceipt(root, { ...goodPin, runtime: 'node' }, operation, verifiedPacket, cohort, members, routes));
  for (const [name, change] of [
    ['skipped-default-call', r => { r.cases[1].defaultRustCalls = 0; }],
    ['extra-default-call', r => { r.cases[0].defaultRustCalls = 2; }],
    ['reference-called-rust', r => { r.cases[0].referenceRustCalls = 1; }],
    ['missing-case', r => { r.cases.pop(); }],
    ['duplicate-case', r => { r.cases[1].id = r.cases[0].id; }],
    ['changed-refusal-trace', r => { r.cases[1].defaultTrace = []; }],
  ]) {
    const changed = structuredClone(good); change(changed);
    const changedPin = await pin(root, `${name}.json`, changed);
    assert.throws(() => verifyHostReceipt(root, { ...changedPin, runtime: 'node' }, operation, verifiedPacket, cohort, members, routes), name);
  }
});

test('all-Rust packet rejects false preflight claims and invalid case inventories after rehash', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-all-rust-invalid-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [name, change] of [
    ['zero-call', p => { p.cases[1].expectedDefaultRustCalls = 0; }],
    ['missing-call', p => { delete p.cases[0].expectedDefaultRustCalls; }],
    ['mixed-profile', p => { p.cases[0].expectsRust = true; }],
    ['duplicate-id', p => { p.cases[1].id = p.cases[0].id; }],
    ['empty-cases', p => { p.cases = []; }],
    ['wrong-profile', p => { p.profile = 'mixed'; }],
  ]) {
    const changed = packet(); change(changed);
    const changedPin = await pin(root, `${name}.json`, changed);
    assert.throws(() => verifyPacket(root, changedPin, operation), name);
  }
  const otherOperation = { ...operation, exportName: 'unrelatedOperation' };
  const otherPacket = { ...packet(), exportName: otherOperation.exportName };
  const otherPin = await pin(root, 'unrelated.json', otherPacket);
  assert.throws(() => verifyPacket(root, otherPin, otherOperation), /unsupported/);
  const wrongContractOperation = { ...operation, contract: { id: 'CONTRACT-062' } };
  const wrongContractPin = await pin(root, 'wrong-contract.json', packet('CONTRACT-062'));
  assert.throws(() => verifyPacket(root, wrongContractPin, wrongContractOperation), /requires CONTRACT-040/);
});

const facetsOwners = {
  inspectCoreFacets: 'umf_core::facets::inspect_core_facets',
  declareCoreFacets: 'umf_core::facets::declare_core_facets',
  verifyCoreFacetDeclaration: 'umf_core::facets::verify_core_facet_declaration',
  historicalCoreFacetPatch: 'umf_core::facets::historical_core_facet_patch',
};
const facetsCohort = { id: 'darwin-arm64', platform: { os: 'darwin', nodeArch: 'arm64' }, archive: { sha256: 'a'.repeat(64), sourceClosureSha256: 'b'.repeat(64) } };
const facetsMembers = { 'dist/umf-node.js': 'c'.repeat(64), 'dist/umf_core_node.node': 'd'.repeat(64), 'dist/umf.js': 'e'.repeat(64) };
const facetsRoutes = { 'package-root-node': 'dist/umf-node.js', 'package-reference': 'dist/umf.js' };

async function facetsFixtureRoot(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-core-facets-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(path.join(process.cwd(), 'docs/helix/04-build/evidence/rust-migration/r5-core-facets'), path.join(root, 'docs/helix/04-build/evidence/rust-migration/r5-core-facets'), { recursive: true });
  await mkdir(path.join(root, 'scripts/rust-migration/r8/facets-retirement-packets'), { recursive: true });
  await cp(path.join(process.cwd(), 'scripts/rust-migration/r8/facets-retirement-packets/expanded-cases.json'), path.join(root, 'scripts/rust-migration/r8/facets-retirement-packets/expanded-cases.json'));
  return root;
}

test('Core Facets /4 profile binds all four operations to exact R5 sources, traces and dispatch expectations', async t => {
  const root = await facetsFixtureRoot(t);
  for (const [exportName, rustOwner] of Object.entries(facetsOwners)) {
    const op = { exportName, rustOwner, contract: { id: 'CONTRACT-040' } };
    const packet = createCoreFacetsRetirementPacket(process.cwd(), exportName);
    const packetPath = `scripts/rust-migration/r8/facets-retirement-packets/${exportName}.packet.json`;
    const packetPin = await pin(root, packetPath, packet);
    const verified = verifyPacket(root, packetPin, op);
    assert.equal(verified.coreFacets, true);
    assert.ok(verified.cases.size > 0);
    const expectedExpanded = {
      inspectCoreFacets: ['missing', 'inapplicable', 'unknownUnitPartial', 'unknownGroupPartial'],
      declareCoreFacets: ['stringLengthZero', 'binaryLength', 'decimalPrecisionScale', 'decimalSafeIntegerEdge'],
      verifyCoreFacetDeclaration: ['saved-json', 'saved-yaml', 'saved-crossDocument'],
      historicalCoreFacetPatch: ['historical-success-representable-projection'],
    }[exportName];
    for (const id of expectedExpanded) assert.ok(verified.cases.has(id), `${exportName} lacks expanded semantic case ${id}`);
    const receipt = {
      format: 'umf.r8.default-route-retirement-host-receipt/4', status: 'pass', runtime: 'node', hostVersion: 'fixture',
      cohortId: facetsCohort.id, hostPlatform: { os: 'darwin', arch: 'arm64' }, archiveSha256: facetsCohort.archive.sha256,
      sourceClosureSha256: facetsCohort.archive.sourceClosureSha256, packetSha256: packetPin.sha256,
      defaultRoute: { routeId: 'package-root-node', entryMember: facetsRoutes['package-root-node'], entrySha256: facetsMembers['dist/umf-node.js'], artifactMembers: [{ path: 'dist/umf_core_node.node', sha256: facetsMembers['dist/umf_core_node.node'] }] },
      referenceRoute: { routeId: 'package-reference', entryMember: 'dist/umf.js', entrySha256: facetsMembers['dist/umf.js'], artifactMembers: [] },
      cases: packet.cases.map(item => ({ id: item.id, defaultOutcome: item.expectedOutcome, defaultTrace: item.expectedTrace, defaultRustCalls: item.expectedDefaultRustCalls, defaultRustOperations: item.expectedDefaultRustOperations, defaultOwnShapeSha256: 'a'.repeat(64), referenceOutcome: item.expectedOutcome, referenceTrace: item.expectedTrace, referenceRustCalls: 0, referenceOwnShapeSha256: 'a'.repeat(64) })),
    };
    const receiptPin = await pin(root, `${exportName}.receipt.json`, receipt);
    assert.doesNotThrow(() => verifyHostReceipt(root, { ...receiptPin, runtime: 'node' }, op, verified, facetsCohort, facetsMembers, facetsRoutes));
    for (const [label, change] of [
      ['outcome', p => { p.cases[0].expectedOutcome.status = 'tampered'; }],
      ['trace', p => { p.cases[0].expectedTrace.push('ownKeys'); }],
      ['dispatch', p => { p.cases[0].expectedDefaultRustCalls = 0; }],
      ['predecessor', p => { p.predecessorHashes['meaning-cases.json'] = '0'.repeat(64); }],
    ]) {
      const changed = structuredClone(packet); change(changed);
      const changedPin = await pin(root, `${exportName}-${label}.json`, changed);
      assert.throws(() => verifyPacket(root, changedPin, op), /exact R5 Core Facets predecessor/, `${exportName}:${label}`);
    }
    const wrongOwner = { ...op, rustOwner: 'umf_core::other::operation' };
    assert.throws(() => verifyPacket(root, packetPin, wrongOwner), /frozen packet identity is invalid/);
    const badReceipt = structuredClone(receipt); badReceipt.cases[0].referenceRustCalls = 1;
    const badReceiptPin = await pin(root, `${exportName}-reference-call.json`, badReceipt);
    assert.throws(() => verifyHostReceipt(root, { ...badReceiptPin, runtime: 'node' }, op, verified, facetsCohort, facetsMembers, facetsRoutes), /reference zero-Rust control/);
    const badTrace = structuredClone(receipt); badTrace.cases[0].defaultTrace.push('out-of-order');
    const badTracePin = await pin(root, `${exportName}-trace.json`, badTrace);
    assert.throws(() => verifyHostReceipt(root, { ...badTracePin, runtime: 'node' }, op, verified, facetsCohort, facetsMembers, facetsRoutes), /outcome\/trace differs/);
    const wrongDispatch = structuredClone(receipt); const multi=wrongDispatch.cases.findIndex(item=>item.defaultRustOperations.length>1); if(multi>=0)wrongDispatch.cases[multi].defaultRustOperations.reverse();else wrongDispatch.cases[0].defaultRustOperations[0]='wrong-operation';
    const wrongDispatchPin = await pin(root, `${exportName}-wrong-dispatch.json`, wrongDispatch);
    assert.throws(() => verifyHostReceipt(root, { ...wrongDispatchPin, runtime: 'node' }, op, verified, facetsCohort, facetsMembers, facetsRoutes), /Rust operation order/);
    for (const [label, change] of [
      ['missing-default-shape', row => { delete row.defaultOwnShapeSha256; }],
      ['malformed-reference-shape', row => { row.referenceOwnShapeSha256 = 'not-a-sha256'; }],
      ['divergent-shapes', row => { row.referenceOwnShapeSha256 = 'b'.repeat(64); }],
    ]) {
      const shapeReceipt = structuredClone(receipt); change(shapeReceipt.cases[0]);
      const shapePin = await pin(root, `${exportName}-${label}.json`, shapeReceipt);
      assert.throws(() => verifyHostReceipt(root, { ...shapePin, runtime: 'node' }, op, verified, facetsCohort, facetsMembers, facetsRoutes), /own-shape witness|missing or unknown fields/);
    }
  }
});

test('legacy mixed packet still requires real Rust and zero-call preflight cases', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-mixed-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const legacy = { format: 'umf.r8.default-route-retirement-packet/1', contractId: 'CONTRACT-040', exportName: operation.exportName, rustOwner: operation.rustOwner, cases: cases.map((item, index) => ({ id: item.id, input: item.input, expectedOutcome: item.expectedOutcome, expectedTrace: item.expectedTrace, expectsRust: index === 0 })) };
  const mixedPin = await pin(root, 'mixed.json', legacy);
  assert.doesNotThrow(() => verifyPacket(root, mixedPin, operation));
  legacy.cases.pop();
  const missingPin = await pin(root, 'missing-preflight.json', legacy);
  assert.throws(() => verifyPacket(root, missingPin, operation), /preflight refusal/);
});

test('bounded /2 Cardinality evidence still cannot retire a default-route row', () => {
  assert.throws(
    () => validateDefaultRouteRetirementEvidence({ format: 'umf.r8.default-route-retirement-evidence/2' }, [], { root: process.cwd() }),
    /CONTRACT acceptance coverage required.*cannot retire/,
  );
});

test('/4 manifest accepts only the ordered four-operation Core Facets profile and cannot retire rows', () => {
  assert.throws(() => requirePacketProfileForManifest('umf.r8.default-route-retirement-evidence/2', { coreFacets: true }), /Core Facets packets require the exact \/4/);
  assert.throws(() => requirePacketProfileForManifest('umf.r8.default-route-retirement-evidence/3', { coreFacets: true }), /Core Facets packets require the exact \/4/);
  assert.doesNotThrow(() => requirePacketProfileForManifest('umf.r8.default-route-retirement-evidence/4', { coreFacets: true }));
  const wrongOrder = {
    format: 'umf.r8.default-route-retirement-evidence/4', profile: 'core-facets', status: 'pass',
    liveSourceManifest: {}, cohorts: [],
    operations: ['declareCoreFacets', 'inspectCoreFacets', 'verifyCoreFacetDeclaration', 'historicalCoreFacetPatch'].map(exportName => ({ exportName })),
  };
  assert.throws(() => validateBoundedDefaultRouteEvidence(wrongOrder, [], { root: process.cwd() }), /exact ordered four-operation profile/);
  const candidate = { ...wrongOrder, operations: ['inspectCoreFacets', 'declareCoreFacets', 'verifyCoreFacetDeclaration', 'historicalCoreFacetPatch'].map(exportName => ({ exportName })) };
  assert.throws(() => validateDefaultRouteRetirementEvidence(candidate, [], { root: process.cwd() }), /missing or unknown fields|safe repository-relative path|needs a SHA-256|cannot retire|exactly four operations/);
});

function ustarArchive(files){
 const blocks=[];
 const write=(header,start,length,value)=>{const bytes=Buffer.from(String(value));bytes.copy(header,start,0,Math.min(length,bytes.length))};
 for(const [name,contentValue] of Object.entries(files).sort(([a],[b])=>a.localeCompare(b))){
  const content=Buffer.from(contentValue),header=Buffer.alloc(512);write(header,0,100,`package/${name}`);write(header,100,8,'0000644\0');write(header,108,8,'0000000\0');write(header,116,8,'0000000\0');write(header,124,12,content.length.toString(8).padStart(11,'0')+'\0');write(header,136,12,'00000000000\0');header.fill(32,148,156);header[156]=48;write(header,257,6,'ustar\0');write(header,263,2,'00');const checksum=header.reduce((sum,byte)=>sum+byte,0);write(header,148,8,checksum.toString(8).padStart(6,'0')+'\0 ');blocks.push(header,content);if(content.length%512)blocks.push(Buffer.alloc(512-content.length%512));
 }
 blocks.push(Buffer.alloc(1024));return gzipSync(Buffer.concat(blocks));
}

function coreFacetAcceptanceResourceEvidence(){
 const ids=['inspect-unknown-array-limit','declare-unknown-array-limit','inspect-nesting-limit','declare-nesting-limit','historical-nesting-limit-before-schema','inspect-near-value-limit-many-qualifiers','declare-near-value-limit-many-qualifiers','inspect-warning-path-amplification','declare-result-copy-limit','malformed-receipt-before-large-current','forged-receipt-before-large-current','valid-receipt-large-current-limit','large-unknown-scalar-over-text-limit','text-writer-over-text-limit-control'];
 const operations={
  'inspect-unknown-array-limit':[],'declare-unknown-array-limit':['admitCoreFacetRequest'],'inspect-nesting-limit':[],'declare-nesting-limit':['admitCoreFacetRequest'],'historical-nesting-limit-before-schema':[],
  'inspect-near-value-limit-many-qualifiers':['inspectCoreFacets'],'declare-near-value-limit-many-qualifiers':['admitCoreFacetRequest','declareCoreFacets'],'inspect-warning-path-amplification':['inspectCoreFacets'],'declare-result-copy-limit':['admitCoreFacetRequest','declareCoreFacets'],
  'malformed-receipt-before-large-current':['prepareCoreFacetVerification'],'forged-receipt-before-large-current':['prepareCoreFacetVerification'],'valid-receipt-large-current-limit':['prepareCoreFacetVerification'],'large-unknown-scalar-over-text-limit':['inspectCoreFacets'],'text-writer-over-text-limit-control':[],
 };
 const integrity={
  'inspect-near-value-limit-many-qualifiers':{qualifierCount:48000,uninterpretedPaths:['/modules/0/elements/0/facets/futureGroup']},
  'declare-near-value-limit-many-qualifiers':{qualifierCount:48000,targetQualifierCount:48000},
  'inspect-warning-path-amplification':{warningPathCount:30000,firstPath:'/modules/0/elements/0/facets/integerWidth/future0',lastPath:'/modules/0/elements/0/facets/integerWidth/future29999'},
  'large-unknown-scalar-over-text-limit':{retained:true,utf16Length:4000001},
 };
 const errors={
  'inspect-unknown-array-limit':['LIMIT','JSON structural limit exceeded','/extensions/future/items/99991'],'declare-unknown-array-limit':['LIMIT','JSON structural limit exceeded','/extensions/future/items/99991'],
  'inspect-nesting-limit':['LIMIT','JSON structural limit exceeded','/extensions/future/nested'+('/x'.repeat(126))],'declare-nesting-limit':['LIMIT','JSON structural limit exceeded','/extensions/future/nested'+('/x'.repeat(126))],
  'historical-nesting-limit-before-schema':['LIMIT','JSON structural limit exceeded','/future'+('/x'.repeat(128))],'declare-result-copy-limit':['LIMIT','JSON structural limit exceeded','/target/extensions/future/items/49965'],
  'malformed-receipt-before-large-current':['CORE_FACET_RECEIPT','Malformed facet declaration',''],'forged-receipt-before-large-current':['CORE_FACET_RECEIPT','Declaration differs from retained source/request',''],
  'valid-receipt-large-current-limit':['LIMIT','JSON structural limit exceeded','/extensions/future/items/99991'],'text-writer-over-text-limit-control':['LIMIT','Serialized text exceeds limit',''],
 };
 return ids.map(id=>{const outcome=integrity[id]?{status:'returned'}:{status:'threw',name:'UmfError',code:errors[id][0],message:errors[id][1],path:errors[id][2]},rust=operations[id],fingerprint=integrity[id]?'a'.repeat(64):null;return{id,expectedRustOperations:rust,defaultRustOperations:rust,defaultRustCalls:rust.length,referenceRustOperations:[],referenceRustCalls:0,defaultOutcome:outcome,referenceOutcome:structuredClone(outcome),defaultResultSha256:fingerprint,referenceResultSha256:fingerprint,defaultOwnShapeSha256:'a'.repeat(64),referenceOwnShapeSha256:'a'.repeat(64),defaultIntegrity:integrity[id]??null,referenceIntegrity:integrity[id]??null}});
}

test('complete /4 acceptance cohort pins promote exactly eight rows with producer-shaped receipts', async t=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'umf-r8-core-facets-acceptance-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const put=async(relative,bytes)=>{const full=path.join(root,relative);await mkdir(path.dirname(full),{recursive:true});await writeFile(full,bytes);return Buffer.from(bytes)};
 const json=async(relative,value)=>{const bytes=Buffer.from(JSON.stringify(value,null,2)+'\n');await put(relative,bytes);return{path:relative,sha256:sha(bytes)}};
 const packagePath='package.json',builderPath='scripts/package-sdk.py',resourcePath='scripts/rust-migration/r8/core-facets-resource-suite.mjs';
 const pkg={name:'@umf/core',version:'1.0.0',private:true,type:'module',license:'MIT',files:['dist/'],exports:{'.':{node:'./dist/umf-node.js',browser:'./dist/umf-browser.js'},'./reference':{import:'./dist/umf.js'}},dependencies:{}};
 await put(packagePath,Buffer.from(JSON.stringify(pkg)+'\n'));await put(builderPath,Buffer.from("'exports': metadata['exports']\n'private': True\n'files': ['dist/']\n"));
 const contractPath='docs/helix/02-design/contracts/CONTRACT-040-core-facets.md';await put(contractPath,Buffer.from('---\nid: CONTRACT-040\n---\n'));
 const sourcePaths={},refPath='src/reference.ts';await put(refPath,Buffer.from('synthetic TypeScript reference route\n'));
 for(const op of Object.keys(facetsOwners)){
  const source=`src/acceptance/${op}.ts`;sourcePaths[op]=source;await put(source,Buffer.from(`// synthetic fixed-point evidence source for ${op}\n`));
 }
 for(const file of ['frozen-typescript.json','meaning-cases.json','regression-cases.json','exact-errors.json'])await put(`docs/helix/04-build/evidence/rust-migration/r5-core-facets/${file}`,await import('node:fs/promises').then(fs=>fs.readFile(path.join(process.cwd(),'docs/helix/04-build/evidence/rust-migration/r5-core-facets',file))));
 await put('scripts/rust-migration/r8/facets-retirement-packets/expanded-cases.json',await import('node:fs/promises').then(fs=>fs.readFile(path.join(process.cwd(),'scripts/rust-migration/r8/facets-retirement-packets/expanded-cases.json'))));
 await put(resourcePath,await import('node:fs/promises').then(fs=>fs.readFile(path.join(process.cwd(),resourcePath))));
 const packetPins={};
 for(const op of Object.keys(facetsOwners))packetPins[op]=await json(`scripts/rust-migration/r8/facets-retirement-packets/${op}.packet.json`,createCoreFacetsRetirementPacket(root,op));
 const inputs={};for(const relative of [packagePath,builderPath,contractPath,resourcePath,...Object.values(sourcePaths),refPath,'docs/helix/04-build/evidence/rust-migration/r5-core-facets/frozen-typescript.json','docs/helix/04-build/evidence/rust-migration/r5-core-facets/meaning-cases.json','docs/helix/04-build/evidence/rust-migration/r5-core-facets/regression-cases.json','docs/helix/04-build/evidence/rust-migration/r5-core-facets/exact-errors.json','scripts/rust-migration/r8/facets-retirement-packets/expanded-cases.json',...Object.values(packetPins).map(item=>item.path)])inputs[relative]=sha(await import('node:fs/promises').then(fs=>fs.readFile(path.join(root,relative))));
 const closureTree=createHash('sha256');for(const relative of Object.keys(inputs).sort()){closureTree.update(relative);closureTree.update('\0');closureTree.update(await import('node:fs/promises').then(fs=>fs.readFile(path.join(root,relative))));closureTree.update('\0')};const closureSha=closureTree.digest('hex'),closure={sha256:closureSha,capturedLiveSha256:closureSha,fileCount:Object.keys(inputs).length,inputs,transform:{status:'fixed-point',generatedInputs:[]}};
 const sourceManifest=await json('evidence/live-source.json',{sourceClosure:closure});
 const archivedPackage={name:pkg.name,version:pkg.version,private:true,type:'module',license:pkg.license,files:['dist/'],exports:pkg.exports,dependencies:{}};const archivedPackageBytes=Buffer.from(JSON.stringify(archivedPackage)+'\n'),assetBytes={native:Buffer.from('synthetic native asset'),wasm:Buffer.from('synthetic wasm asset')};
 const platformByCohort={'darwin-arm64':{os:'darwin',arch:'aarch64',nodeArch:'arm64',nativeTarget:'aarch64-apple-darwin'},'linux-x86_64':{os:'linux',arch:'x86_64',nodeArch:'x64',nativeTarget:'x86_64-unknown-linux-gnu'}};
 const manifestCohorts=[],acceptancePins=[],rows=[],operations=[],runtimeCases=[];
 const resourceEvidence=coreFacetAcceptanceResourceEvidence(),harnessSha=sha(await import('node:fs/promises').then(fs=>fs.readFile(path.join(root,resourcePath))));
 for(const [cohortId,platform] of Object.entries(platformByCohort)){
  const cohortDir=`evidence/${cohortId}`,archivePath=`${cohortDir}/sdk.tgz`,archiveMembers={'package.json':sha(archivedPackageBytes),'dist/rust-default-manifest.json':'','dist/umf-node.js':sha(Buffer.from('node entry')),'dist/umf-browser.js':sha(Buffer.from('browser entry')),'dist/umf.js':sha(Buffer.from('reference entry')),'dist/umf_core_node.node':sha(assetBytes.native),'dist/umf_core_wasm_bg.wasm':sha(assetBytes.wasm)};
  const rustManifest={platform,sourceClosure:{...closure,liveInputs:inputs}};const rustManifestBytes=Buffer.from(JSON.stringify(rustManifest)+'\n');archiveMembers['dist/rust-default-manifest.json']=sha(rustManifestBytes);
  const archiveBytes=ustarArchive({'package.json':archivedPackageBytes,'dist/rust-default-manifest.json':rustManifestBytes,'dist/umf-node.js':'node entry','dist/umf-browser.js':'browser entry','dist/umf.js':'reference entry','dist/umf_core_node.node':assetBytes.native,'dist/umf_core_wasm_bg.wasm':assetBytes.wasm}),archiveSha=sha(archiveBytes),archivePackagePin=await put(`${cohortDir}/archive-package.json`,archivedPackageBytes);
  await put(archivePath,archiveBytes);const memberManifest=await json(`${cohortDir}/member-manifest.json`,{status:'pass',algorithm:'sha256',archiveSha256:archiveSha,packageManifestSha256:archiveMembers['package.json'],archiveMemberCount:Object.keys(archiveMembers).length,verifiedMemberCount:Object.keys(archiveMembers).length,members:archiveMembers});
  const archive={path:archivePath,sha256:archiveSha,sourceClosureSha256:closureSha,sourceInputCount:Object.keys(inputs).length,generatedTransformCount:0,packageManifestSha256:archiveMembers['package.json']};
  const consumerLock={lockfileVersion:3,packages:{'':{},'node_modules/@umf/core':{version:pkg.version,resolved:'file:../sdk.tgz',integrity:`sha512-${createHash('sha512').update(archiveBytes).digest('base64')}`},'node_modules/example':{version:'1.0.0',integrity:'sha512-ZXhhbXBsZQ=='}}};const lockBytes=Buffer.from(JSON.stringify(consumerLock)+'\n');await put(`${cohortDir}/consumer-lock.json`,lockBytes);
  const rawHostPins=[],resourceHosts=[],retirementHostReceipts=[];
  const originalAssets={native:{path:'dist/umf_core_node.node',sha256:archiveMembers['dist/umf_core_node.node'],bytes:assetBytes.native.length},wasm:{path:'dist/umf_core_wasm_bg.wasm',sha256:archiveMembers['dist/umf_core_wasm_bg.wasm'],bytes:assetBytes.wasm.length}};
  const assetCases=[];for(const runtime of ['node','bun','Chromium'])for(const state of ['intact','missing','corrupt']){const browser=runtime==='Chromium',kind=browser?'wasm':'native',item={runtime,version:'fixture',asset:originalAssets[kind].path,state};if(state==='intact'){if(browser){item.outcome={status:'returned',result:{meaning:{state:'known',facets:{integerWidth:{bits:16}}}}};item.wasmRequested=true;item.externalRequests=0}else{item.exitCode=0;item.nativeOperations=['model/inspectCoreFacets']}}else{if(state==='corrupt')item.mutatedAssetSha256='f'.repeat(64);if(browser){item.outcome={status:'threw',phase:'import',message:'WebAssembly failed to load'};item.wasmRequested=true;item.externalRequests=0}else{item.exitCode=23;item.error={phase:'import',code:'ERR_DLOPEN_FAILED',message:'native addon .node failed to load'};item.stdout=''}}assetCases.push(item)}
  const assetReceipt={format:'umf.r8.core-facets-installed-asset-controls/1',status:'pass',scope:'synthetic validator fixture',archiveSha256:archiveSha,package:{name:pkg.name,version:pkg.version},originalAssets,cases:assetCases};const assetPin=await json(`${cohortDir}/receipts/installed-asset-controls.json`,assetReceipt);
  for(const runtime of ['node','bun','chromium']){const packetEvidence={default:{},reference:{}};for(const op of Object.keys(facetsOwners)){const packet=createCoreFacetsRetirementPacket(root,op);packetEvidence.default[op]=packet.cases.map(item=>({id:item.id,outcome:item.expectedOutcome,trace:item.expectedTrace,ownShapeSha256:'a'.repeat(64),rustOperations:item.expectedDefaultRustOperations}));packetEvidence.reference[op]=packet.cases.map(item=>({id:item.id,outcome:item.expectedOutcome,trace:item.expectedTrace,ownShapeSha256:'a'.repeat(64),rustOperations:[]}));}const rawPath=`${cohortDir}/receipts/${cohortId}-${runtime}.json`,raw={format:'umf.r8.core-facets-installed/1',status:'pass',host:runtime,cohort:cohortId,archive:{sha256:archiveSha},sourceClosure:{sha256:closureSha},observation:{resourceEvidence,packetEvidence}};if(runtime==='chromium')raw.browser={wasmNetworkRequest:true,externalRequests:[]};const rawPin=await json(rawPath,raw),hostPin={name:`${cohortId}-${runtime}.json`,path:`receipts/${cohortId}-${runtime}.json`,sha256:rawPin.sha256};rawHostPins.push(hostPin);resourceHosts.push({runtime,path:hostPin.path,sha256:hostPin.sha256,cases:resourceEvidence});
   for(const op of Object.keys(facetsOwners)){const packet=createCoreFacetsRetirementPacket(root,op),runtimeReceipt={format:'umf.r8.default-route-retirement-host-receipt/4',status:'pass',runtime,hostVersion:'fixture',cohortId,hostPlatform:{os:platform.os,arch:platform.nodeArch},archiveSha256:archiveSha,sourceClosureSha256:closureSha,packetSha256:packetPins[op].sha256,defaultRoute:{routeId:runtime==='chromium'?'package-root-browser':'package-root-node',entryMember:runtime==='chromium'?'dist/umf-browser.js':'dist/umf-node.js',entrySha256:archiveMembers[runtime==='chromium'?'dist/umf-browser.js':'dist/umf-node.js'],artifactMembers:[{path:runtime==='chromium'?'dist/umf_core_wasm_bg.wasm':'dist/umf_core_node.node',sha256:archiveMembers[runtime==='chromium'?'dist/umf_core_wasm_bg.wasm':'dist/umf_core_node.node']}]},referenceRoute:{routeId:'package-reference',entryMember:'dist/umf.js',entrySha256:archiveMembers['dist/umf.js'],artifactMembers:[]},cases:packet.cases.map(item=>({id:item.id,defaultOutcome:item.expectedOutcome,defaultTrace:item.expectedTrace,defaultRustCalls:item.expectedDefaultRustCalls,defaultRustOperations:item.expectedDefaultRustOperations,defaultOwnShapeSha256:'a'.repeat(64),referenceOutcome:item.expectedOutcome,referenceTrace:item.expectedTrace,referenceRustCalls:0,referenceOwnShapeSha256:'a'.repeat(64)}))};const rel=`receipts/${op}-${runtime}.json`,pin=await json(`${cohortDir}/${rel}`,runtimeReceipt);retirementHostReceipts.push({runtime,operation:op,path:rel,sha256:pin.sha256,caseCount:packet.cases.length});runtimeCases.push({op,runtime,path:`${cohortDir}/${rel}`,sha256:pin.sha256});}
  }
  const cohortDoc={format:'umf.r8.core-facets-dependency-installed/1',status:'pass',scope:'synthetic acceptance validator integration fixture',archive:{sha256:archiveSha,bytes:archiveBytes.length},sourceClosure:{sha256:closureSha,fileCount:Object.keys(inputs).length,initialCheck:{sha256:closureSha,fileCount:Object.keys(inputs).length},finalCheck:{sha256:closureSha,fileCount:Object.keys(inputs).length}},consumer:{manager:'npm',version:'fixture',offline:true,installFlags:['--offline','--ignore-scripts','--no-audit','--no-fund'],package:{name:pkg.name,version:pkg.version,path:'node_modules/@umf/core'},lock:{file:'package-lock.json',lockfileVersion:3,integrityDependencyCount:1,sha256:sha(lockBytes),archiveIntegrity:`sha512-${createHash('sha512').update(archiveBytes).digest('base64')}`},dependencies:{},resolvedRoutes:{node:{root:'file:///tmp/node_modules/@umf/core/dist/umf-node.js',reference:'file:///tmp/node_modules/@umf/core/dist/umf.js'},bun:{root:'file:///tmp/node_modules/@umf/core/dist/umf-node.js',reference:'file:///tmp/node_modules/@umf/core/dist/umf.js'}}},negativeControls:{lockWithoutIntegrityRejected:true,wrongInstalledIdentityRejected:true,wrongArchiveIdentityRejected:true,wrongDefaultRouteRejected:true,wrongResolvedDefaultRouteRejected:true},hosts:rawHostPins,resourceSuite:{format:'umf.r8.core-facets-resource-suite/1',caseCount:14,harnessSha256:harnessSha,hosts:resourceHosts},installedAssetControls:{path:'receipts/installed-asset-controls.json',sha256:assetPin.sha256,archiveSha256:archiveSha,caseCount:9,status:'pass'},linuxX64:{},retirementHostReceipts};
  const cohortPin=await json(`${cohortDir}/cohort.json`,cohortDoc);acceptancePins.push({cohortId,cohort:cohortPin});manifestCohorts.push({id:cohortId,platform,archive,memberManifest:{path:`${cohortDir}/member-manifest.json`,sha256:memberManifest.sha256},archivePackageManifest:{path:`${cohortDir}/archive-package.json`,sha256:sha(archivePackagePin)}});
 }
 for(const op of Object.keys(facetsOwners)){
  const logical=`CONTRACT-040#${op}`,source=sourcePaths[op],sourceSha256=inputs[source];
  for(const routeId of ['package-root-node','package-root-browser'])rows.push({routeId,logicalDeclarationKey:logical,exportName:op,rowKind:'executable',source,sourceSha256,declarationKind:'function',sourceSelectedImplementation:{rustOwner:facetsOwners[op]},acceptedRustOperation:facetsOwners[op]});
  rows.push({routeId:'package-reference',logicalDeclarationKey:logical,exportName:op,rowKind:'executable',source:refPath,sourceSha256:inputs[refPath],declarationKind:'function',sourceSelectedImplementation:null});
  const rowIdentity=routeId=>{const row=rows.find(item=>item.routeId===routeId&&item.exportName===op);return{routeId,logicalDeclarationKey:logical,exportName:op,source:row.source,sourceSha256:row.sourceSha256,declarationKind:row.declarationKind}};
  const receiptCohorts=manifestCohorts.map(cohort=>({cohortId:cohort.id,receipts:['node','bun','chromium'].map(runtime=>{const pin=runtimeCases.find(item=>item.op===op&&item.runtime===runtime&&item.path.startsWith(`evidence/${cohort.id}/`));return{runtime,path:pin.path,sha256:pin.sha256}})}));
  operations.push({exportName:op,logicalDeclarationKey:logical,contract:{id:'CONTRACT-040',path:contractPath,sha256:inputs[contractPath]},rustOwner:facetsOwners[op],rows:[rowIdentity('package-root-node'),rowIdentity('package-root-browser')],packet:packetPins[op],receiptCohorts});
 }
 const manifest={format:'umf.r8.default-route-retirement-evidence/4',profile:'core-facets',status:'pass',liveSourceManifest:sourceManifest,cohorts:manifestCohorts,operations,acceptanceCohorts:acceptancePins};
 const retired=validateDefaultRouteRetirementEvidence(manifest,rows,{root});
 assert.equal(retired.size,8);assert.ok([...retired.values()].every(item=>item.status==='retired'));
 for(const item of retired.values())for(const pin of acceptancePins)assert.ok(item.evidence.some(evidence=>evidence.path===pin.cohort.path&&evidence.sha256===pin.cohort.sha256));
});

test('the /3 retirement path explicitly rejects Record Values pending current contract and memory qualification', () => {
  const candidate = {
    format: 'umf.r8.default-route-retirement-evidence/3',
    operations: [{ exportName: 'validateCoreRecordValues' }],
  };
  const logicalDeclarationKey = ['validateCoreRecordValues', 'validateCoreRecordValues', 'condition-selected-root-binding', '0'].join('\0');
  const rows = ['package-root-node', 'package-root-browser'].map(routeId => ({
    routeId, logicalDeclarationKey, exportName: 'validateCoreRecordValues', defaultRouteRetirement: { status: 'open', evidence: [] },
  }));
  assert.throws(
    () => validateDefaultRouteRetirementEvidence(candidate, rows, { root: process.cwd() }),
    /Record Values bounded evidence is not-retirable.*CONTRACT-049.*independent acceptance review.*measured memory bounds/,
  );
  assert.deepEqual(rows.map(row => row.defaultRouteRetirement.status), ['open', 'open']);
});

const securityNotOperation = {
  exportName: 'securityNot',
  rustOwner: 'umf_core::security_logic::security_not',
  contract: { id: 'CONTRACT-062' },
};
const securityIds = ['T', 'F', 'U', 'null', 'number', 'boolean', 'unknown-string', 'array', 'object', 'null-prototype', 'accessor', 'proxy-ownKeys', 'proxy-getPrototype', 'proxy-get'];
const securityExpected = id => ['T', 'F', 'U'].includes(id)
  ? { kind: 'return', value: ({ T: 'F', F: 'T', U: 'U' })[id], trace: [] }
  : { kind: 'throw', name: 'UmfError', constructor: 'UmfError', code: 'SECURITY_TRUTH', message: 'Invalid security truth', path: '', trace: [] };
const securityPacket = () => ({
  format: 'umf.r8.default-route-retirement-packet/3', profile: 'security-not', contractId: 'CONTRACT-062',
  exportName: 'securityNot', rustOwner: securityNotOperation.rustOwner,
  cases: securityIds.map(id => ({ id, input: { case: id }, expectedOutcome: securityExpected(id), expectedTrace: [], expectedDefaultRustCalls: ['T', 'F', 'U'].includes(id) ? 1 : 0 })),
});

test('securityNot acceptance packet binds all 14 exact truth, invalid-input, trace and Rust-dispatch cases', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-security-not-packet-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const good = securityPacket();
  const goodPin = await pin(root, 'security-not.json', good);
  const verified = verifyPacket(root, goodPin, securityNotOperation);
  assert.equal(verified.securityNot, true);
  assert.equal(verified.cases.size, 14);

  for (const [name, mutate] of [
    ['truth-result', p => { p.cases[0].expectedOutcome.value = 'T'; }],
    ['invalid-error-class', p => { p.cases[3].expectedOutcome.name = 'UmfCoreError'; p.cases[3].expectedOutcome.constructor = 'UmfCoreError'; }],
    ['invalid-code', p => { p.cases[3].expectedOutcome.code = 'RESOURCE_LIMIT'; }],
    ['effect-trace', p => { p.cases[10].expectedTrace.push('getter'); }],
    ['rust-dispatch', p => { p.cases[0].expectedDefaultRustCalls = 0; }],
    ['invalid-dispatch', p => { p.cases[3].expectedDefaultRustCalls = 1; }],
    ['case-order', p => { [p.cases[0], p.cases[1]] = [p.cases[1], p.cases[0]]; }],
    ['case-omission', p => { p.cases.pop(); }],
    ['input-alias', p => { p.cases[0].input.case = 'F'; }],
    ['wrong-operation', p => { p.exportName = 'securityAnd'; }],
  ]) {
    const changed = structuredClone(good); mutate(changed);
    const changedPin = await pin(root, `${name}.json`, changed);
    assert.throws(() => verifyPacket(root, changedPin, securityNotOperation), /securityNot packet|identity is invalid/ , name);
  }
});

test('securityNot host receipts require exact outcomes, traces and default/reference dispatch counts', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'umf-r8-security-not-receipt-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const packetPin = await pin(root, 'packet.json', securityPacket());
  const verifiedPacket = verifyPacket(root, packetPin, securityNotOperation);
  const securityCohort = { ...cohort, platform: { os: 'darwin', nodeArch: 'arm64' } };
  const securityMembers = { ...members };
  const securityRoutes = { ...routes };
  const good = receipt(packetPin.sha256);
  good.format = 'umf.r8.default-route-retirement-host-receipt/3';
  good.cases = securityIds.map(id => ({
    id, defaultOutcome: securityExpected(id), defaultTrace: [], defaultRustCalls: ['T', 'F', 'U'].includes(id) ? 1 : 0,
    referenceOutcome: securityExpected(id), referenceTrace: [], referenceRustCalls: 0,
  }));
  const goodPin = await pin(root, 'good-receipt.json', good);
  assert.doesNotThrow(() => verifyHostReceipt(root, { ...goodPin, runtime: 'node' }, securityNotOperation, verifiedPacket, securityCohort, securityMembers, securityRoutes));
  for (const [name, mutate] of [
    ['changed-truth', r => { r.cases[0].defaultOutcome.value = 'T'; }],
    ['changed-invalid-error', r => { r.cases[3].defaultOutcome.name = 'UmfCoreError'; }],
    ['observed-effect', r => { r.cases[10].defaultTrace.push('getter'); }],
    ['skipped-rust-call', r => { r.cases[0].defaultRustCalls = 0; }],
    ['called-rust-for-invalid', r => { r.cases[3].defaultRustCalls = 1; }],
    ['reference-rust-call', r => { r.cases[0].referenceRustCalls = 1; }],
    ['missing-case', r => { r.cases.pop(); }],
  ]) {
    const changed = structuredClone(good); mutate(changed);
    const changedPin = await pin(root, `${name}.json`, changed);
    assert.throws(() => verifyHostReceipt(root, { ...changedPin, runtime: 'node' }, securityNotOperation, verifiedPacket, securityCohort, securityMembers, securityRoutes), name);
  }
});

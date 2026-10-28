// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const digest=/^[a-f0-9]{64}$/;

export function verifyFixedPoint(manifest, expectedClosureSha256, liveSourceBytes){
  const closure=manifest?.sourceClosure;
  assert(closure&&digest.test(expectedClosureSha256),'explicit source closure SHA-256 is required');
  assert.equal(closure.sha256,expectedClosureSha256,'archive source closure hash');
  assert.equal(closure.capturedLiveSha256,expectedClosureSha256,'archive captured-live source hash');
  assert.deepEqual(closure.transform,{status:'fixed-point',generatedInputs:[]},'archive source transform');
  const inputs=closure.inputs;
  assert(inputs&&typeof inputs==='object'&&!Array.isArray(inputs),'archive source input map');
  const names=Object.keys(inputs).sort();
  assert(names.length>0,'archive source input map is empty');
  const tree=createHash('sha256');
  for(const name of names){
    assert(digest.test(inputs[name]),`invalid source pin for ${name}`);
    const bytes=liveSourceBytes(name);
    assert(bytes,`current source is missing: ${name}`);
    assert.equal(sha256(bytes),inputs[name],`current source hash: ${name}`);
    tree.update(name);tree.update('\0');tree.update(bytes);tree.update('\0');
  }
  assert.equal(tree.digest('hex'),expectedClosureSha256,'recomputed current source closure');
  return {sha256:expectedClosureSha256,inputCount:names.length,transformStatus:'fixed-point',transformCount:0};
}

export function verifyArchiveAssets(members, expectedHashes, referenceEntry){
  assert(expectedHashes&&typeof expectedHashes==='object','archive member hash map is required');
  const required=['dist/umf-node.js','dist/umf-browser.js','dist/umf_core_node.node','dist/umf_core_wasm_bg.wasm','dist/umf.js',referenceEntry];
  for(const name of new Set(required)){
    const bytes=members.get(name);
    assert(bytes,`required package asset is missing: ${name}`);
    assert(digest.test(expectedHashes[name]??''),`required package asset has no valid hash pin: ${name}`);
    assert.equal(sha256(bytes),expectedHashes[name],`required package asset hash mismatch: ${name}`);
  }
  return Object.fromEntries([...new Set(required)].map(name=>[name,expectedHashes[name]]));
}

export function verifyPackageRoutes(packageJson){
  const routes=packageJson?.exports;
  const node=routes?.['.']?.node;
  const browser=routes?.['.']?.browser;
  const reference=typeof routes?.['./reference']==='string'?routes['./reference']:routes?.['./reference']?.import;
  assert.equal(node,'./dist/umf-node.js','Node default package route');
  assert.equal(browser,'./dist/umf-browser.js','browser default package route');
  assert(reference,'explicit ./reference package route');
  assert(reference.startsWith('./dist/'),'reference route must resolve inside dist');
  return {node,browser,reference};
}

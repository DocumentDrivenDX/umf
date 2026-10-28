import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {verifyArchiveAssets,verifyFixedPoint,verifyPackageRoutes} from '../../scripts/rust-migration/r8/protobuf-descriptor-document-qualification-core.mjs';

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const assetNames=['dist/umf-node.js','dist/umf-browser.js','dist/umf_core_node.node','dist/umf_core_wasm_bg.wasm','dist/umf.js'];
const bytesByName=new Map(assetNames.map(name=>[name,Buffer.from(name)]));
const pins=Object.fromEntries([...bytesByName].map(([name,bytes])=>[name,sha(bytes)]));

test('installed Protobuf gate requires every Node/WASM/default/reference asset and valid hashes',()=>{
  expect(Object.keys(verifyArchiveAssets(bytesByName,pins,'dist/umf.js'))).toHaveLength(5);
  for(const name of ['dist/umf_core_node.node','dist/umf_core_wasm_bg.wasm']){
    const missing=new Map(bytesByName);missing.delete(name);
    expect(()=>verifyArchiveAssets(missing,pins,'dist/umf.js')).toThrow(`required package asset is missing: ${name}`);
    const corrupt=new Map(bytesByName);corrupt.set(name,Buffer.from('corrupt'));
    expect(()=>verifyArchiveAssets(corrupt,pins,'dist/umf.js')).toThrow(`required package asset hash mismatch: ${name}`);
  }
});

test('installed Protobuf gate requires exact root and reference routes',()=>{
  expect(verifyPackageRoutes({exports:{'.':{node:'./dist/umf-node.js',browser:'./dist/umf-browser.js'},'./reference':{import:'./dist/umf.js'}}})).toEqual({node:'./dist/umf-node.js',browser:'./dist/umf-browser.js',reference:'./dist/umf.js'});
  expect(()=>verifyPackageRoutes({exports:{'.':{node:'./dist/umf-node.js',browser:'./dist/umf-browser.js'}}})).toThrow('explicit ./reference package route');
});

test('installed Protobuf gate accepts only an exact current fixed point',()=>{
  const source=Buffer.from('source');
  const tree=createHash('sha256').update('src/example.ts').update('\0').update(source).update('\0').digest('hex');
  const manifest={sourceClosure:{sha256:tree,capturedLiveSha256:tree,transform:{status:'fixed-point',generatedInputs:[]},inputs:{'src/example.ts':sha(source)}}};
  expect(verifyFixedPoint(manifest,tree,name=>name==='src/example.ts'?source:undefined)).toMatchObject({sha256:tree,inputCount:1,transformStatus:'fixed-point',transformCount:0});
  expect(()=>verifyFixedPoint({...manifest,sourceClosure:{...manifest.sourceClosure,transform:{status:'changed',generatedInputs:['x']}}},tree,()=>source)).toThrow('archive source transform');
  expect(()=>verifyFixedPoint(manifest,tree,()=>Buffer.from('changed'))).toThrow('current source hash: src/example.ts');
});

// Complete ordered public-envelope replay through the real opt-in host facade.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const repo=resolve(import.meta.dirname,'../../../..');
const host=process.env.UMF_PARQUET_PAGES_HOST ?? 'node';
let engine;
if(host==='wasm') {
  const packageRoot=resolve(process.env.UMF_PARQUET_CAPTURE_WASM_PACKAGE ?? resolve(repo,'bindings/core/wasm/pkg'));
  const wasm=await import(pathToFileURL(resolve(packageRoot,'umf_core_wasm.js')).href);
  await wasm.default({module_or_path:await readFile(resolve(packageRoot,'umf_core_wasm_bg.wasm'))});
  const binding=await import(pathToFileURL(resolve(repo,'bindings/core/wasm/index.js')).href);
  engine=binding.createParquetCaptureEngine(wasm);
  if(typeof wasm.test_parquet_snappy_vector==='function') {
    assert.throws(()=>wasm.test_parquet_snappy_vector([0x00,0xfc,0xff,0xff,0xff,0xff],0));
  }
} else {
  const binding=await import(pathToFileURL(resolve(process.env.UMF_PARQUET_CAPTURE_NODE_PACKAGE ?? resolve(repo,'bindings/core/node'),'index.js')).href);
  engine=binding.createParquetCaptureEngine();
}
const frozen=JSON.parse(await readFile(resolve(repo,'tests/rust-core/fixtures/parquet-pages-bodies-ts-freeze.json'),'utf8'));
const plain=value=>JSON.parse(JSON.stringify(value));
const footerFrozen=JSON.parse(await readFile(resolve(repo,'tests/rust-core/fixtures/parquet-footer-malformed-ts-freeze.json'),'utf8'));
for(const c of footerFrozen.cases){
  const bytes=Buffer.from(c.bytes,'hex');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),c.sha256,c.id);
  const source=engine.captureParquet(new Uint8Array(bytes),{id:c.id});
  const actual=engine.decodeParquetFooter(source);
  assert.deepEqual(plain(actual),{source:plain(source),...c.typescript.value},`${host}: ${c.id}: footer envelope`);
  assert.deepEqual(Object.keys(actual),Object.keys({source:source,...c.typescript.value}),`${host}: ${c.id}: footer key order`);
  assert.deepEqual(engine.exportParquetCapture(actual.source),new Uint8Array(bytes),c.id);
}
for(const c of frozen.cases){
  const bytes=await readFile(resolve(repo,c.path));
  if(c.mutation){assert.equal(createHash('sha256').update(bytes).digest('hex'),c.baseSha256);if(c.mutation.bytes)bytes.set(c.mutation.bytes,c.mutation.offset);else bytes[c.mutation.offset]^=c.mutation.xor;}
  assert.equal(createHash('sha256').update(bytes).digest('hex'),c.sha256,c.id);
  const document=engine.captureParquet(new Uint8Array(bytes),{id:c.id});
  for(const [name,expected] of [['inspectParquetPages',c.page],['decodeParquetPageBodies',c.body]]){
    const actual=engine[name](document);
    assert.deepEqual(plain(actual),{source:plain(document),...expected},`${host}: ${c.id}: ${name} full public envelope`);
  }
  assert.deepEqual(engine.exportParquetCapture(document),new Uint8Array(bytes),c.id);
}
const bytes=await readFile(resolve(repo,'fixtures/parquet/pages/negative/valid-v1.parquet'));
const original=engine.captureParquet(new Uint8Array(bytes),{id:'\ud800-page'});
original.vocabularies['future.vendor']={version:'0.1.0',['\udfffuture']:'v\ud800alue'};
for(const name of ['inspectParquetPages','decodeParquetPageBodies','decodeParquetFooter']){
  const result=engine[name](original);
  assert.equal(result.source.id,'\ud800-page');
  assert.equal(result.source.vocabularies['future.vendor']['\udfffuture'],'v\ud800alue');
  assert.deepEqual(engine.exportParquetCapture(result.source),new Uint8Array(bytes));
}
console.log(JSON.stringify({status:'passed',host,pageCases:frozen.cases.length,footerCases:footerFrozen.cases.length}));

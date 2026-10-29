// Real Chromium execution of the source-built opt-in WASM page/body facade.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const repo=resolve(import.meta.dirname,'../../../..');
const pkg=resolve(process.env.UMF_PARQUET_CAPTURE_WASM_PACKAGE ?? resolve(repo,'bindings/core/wasm/pkg'));
const frozen=JSON.parse(await readFile(resolve(repo,'tests/rust-core/fixtures/parquet-pages-bodies-ts-freeze.json'),'utf8'));
const footerFrozen=JSON.parse(await readFile(resolve(repo,'tests/rust-core/fixtures/parquet-footer-malformed-ts-freeze.json'),'utf8'));
const footerCases=footerFrozen.cases.map(c=>({...c,bytes:[...Buffer.from(c.bytes,'hex')]}));
const cases=await Promise.all(frozen.cases.map(async c=>{
  const bytes=await readFile(resolve(repo,c.path));
  if(c.mutation){assert.equal(createHash('sha256').update(bytes).digest('hex'),c.baseSha256);if(c.mutation.bytes)bytes.set(c.mutation.bytes,c.mutation.offset);else bytes[c.mutation.offset]^=c.mutation.xor;}
  assert.equal(createHash('sha256').update(bytes).digest('hex'),c.sha256);
  return {...c,bytes:[...bytes]};
}));
const files=new Map([['/facade.js','facade.js'],['/umf_core_wasm.js','umf_core_wasm.js'],['/umf_core_wasm_bg.wasm','umf_core_wasm_bg.wasm']]);
let browser;
try{
  browser=await chromium.launch({headless:true,...(process.env.UMF_CHROMIUM_PATH?{executablePath:process.env.UMF_CHROMIUM_PATH}:{})});
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',async route=>{
    const name=files.get(new URL(route.request().url()).pathname);
    if(!name){await route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Parquet WASM probe</title>'});return;}
    await route.fulfill({status:200,contentType:name.endsWith('.wasm')?'application/wasm':'text/javascript',body:await readFile(resolve(pkg,name))});
  });
  await page.goto('http://parquet.local/');
  const actual=await page.evaluate(async ({cases,footerCases})=>{
    const wasm=await import('/umf_core_wasm.js');await wasm.default({module_or_path:'/umf_core_wasm_bg.wasm'});
    const {createParquetCaptureEngine}=await import('/facade.js');const engine=createParquetCaptureEngine(wasm);
    const out=[];
    for(const c of cases){const document=engine.captureParquet(new Uint8Array(c.bytes),{id:c.id});
      const page=engine.inspectParquetPages(document),body=engine.decodeParquetPageBodies(document);
      const sourceValid=page.source.id===c.id&&body.source.id===c.id&&engine.exportParquetCapture(page.source).every((b,i)=>b===c.bytes[i]);
      delete page.source;delete body.source;out.push({id:c.id,page:JSON.parse(JSON.stringify(page)),body:JSON.parse(JSON.stringify(body)),sourceValid});
    }
    const footerOut=[];
    for(const c of footerCases){const document=engine.captureParquet(new Uint8Array(c.bytes),{id:c.id});
      const result=engine.decodeParquetFooter(document),keys=Object.keys(result);
      const sourceValid=result.source.id===c.id&&engine.exportParquetCapture(result.source).every((b,i)=>b===c.bytes[i]);
      delete result.source;footerOut.push({id:c.id,value:JSON.parse(JSON.stringify(result)),keys,sourceValid});
    }
    const unicode=engine.captureParquet(new Uint8Array(cases[0].bytes),{id:'\ud800-page'});
    unicode.vocabularies['future.vendor']={version:'0.1.0',['\udfffuture']:'v\ud800alue'};
    const retained=['inspectParquetPages','decodeParquetPageBodies','decodeParquetFooter'].every(name=>{
      const source=engine[name](unicode).source;
      return source.id==='\ud800-page'&&source.vocabularies['future.vendor']['\udfffuture']==='v\ud800alue';
    });
    return {out,footerOut,retained};
  },{cases,footerCases});
  assert.deepEqual(errors,[]);
  assert.equal(actual.retained,true);
  for(const row of actual.out){const expected=cases.find(c=>c.id===row.id);assert.equal(row.sourceValid,true,row.id);assert.deepEqual(row.page,expected.page,row.id+' page');assert.deepEqual(row.body,expected.body,row.id+' body');}
  for(const row of actual.footerOut){const expected=footerCases.find(c=>c.id===row.id);assert.equal(row.sourceValid,true,row.id);assert.deepEqual(row.value,expected.typescript.value,row.id+' footer');assert.deepEqual(row.keys,['source',...Object.keys(expected.typescript.value)],row.id+' footer key order');}
  console.log(JSON.stringify({status:'passed',host:'chromium',version:browser.version(),pageCases:actual.out.length,footerCases:actual.footerOut.length}));
}finally{await browser?.close();}

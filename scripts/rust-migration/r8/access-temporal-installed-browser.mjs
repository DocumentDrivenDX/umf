import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const consumerRoot = path.resolve(process.argv[2]);
const packetPath = path.resolve(process.argv[3]);
const packageRoot = path.join(consumerRoot, 'node_modules/@umf/core');
const packet = JSON.parse(await readFile(packetPath, 'utf8'));
const canonical = value => JSON.stringify(value, (_key, child) =>
  child && typeof child === 'object' && !Array.isArray(child)
    ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b)))
    : child);
const fixture = JSON.stringify(packet).replaceAll('<', '\\u003c');
const html = `<!doctype html><meta charset="utf-8"><script type="module">
const canonical=${canonical.toString()};
const packet=${fixture};
const result=(fn,input)=>{try{return{status:'ok',value:fn(input.kind,input.token)}}catch(e){return{status:'error',name:e.name,message:e.message}}};
const finish=async()=>{
  try {
    const api=await import('/node_modules/@umf/core/dist/umf-browser.js');
    const reference=await import('/node_modules/@umf/core/dist/umf.js');
    const cases=[];
    for(const candidate of packet.cases){
      const actual=result(api.parseAccessTemporal,candidate.input);
      const expected=result(reference.parseAccessTemporal,candidate.input);
      if(canonical(actual)!==canonical(candidate.outcome)||canonical(expected)!==canonical(candidate.outcome)||canonical(actual)!==canonical(expected))throw Error(candidate.id+' mismatch '+JSON.stringify({actual,expected,packet:candidate.outcome}));
      cases.push(candidate.id);
    }
    let proxyTraps=0,getterCalls=0;
    const proxy=new Proxy({},{getPrototypeOf(){proxyTraps++;throw Error('proxy observed')},ownKeys(){proxyTraps++;throw Error('proxy observed')}});
    const accessor=Object.defineProperty({},'value',{enumerable:true,get(){getterCalls++;throw Error('getter observed')}});
    for(const token of [null,42,{},[],new Date(0),new String('2024-01-01'),proxy,accessor])for(const fn of [api.parseAccessTemporal,reference.parseAccessTemporal]){let refused=false;try{fn('date',token)}catch(e){refused=e instanceof TypeError&&e.message==='Access temporal requires text'}if(!refused)throw Error('raw host refusal mismatch')}
    if(proxyTraps||getterCalls)throw Error('host input observed');
    const date9=packet.cases.find(c=>c.id==='date-9');
    window.result={taggedCases:cases.length,taggedPacketParity:true,defaultReferenceParity:true,rawHostRefusals:8,proxyTraps,getterCalls,date9:{token:date9.input.token,typeofToken:typeof date9.input.token,utf16Length:date9.input.token.length,codeUnits:Array.from({length:date9.input.token.length},(_,i)=>date9.input.token.charCodeAt(i)),default:result(api.parseAccessTemporal,date9.input),reference:result(reference.parseAccessTemporal,date9.input)}};
  }catch(error){window.error=String(error?.stack||error)}
};finish();
</script>`;

const server=createServer(async(request,response)=>{
  try {
    const url=new URL(request.url,'http://localhost');
    if(url.pathname==='/'){wasmMode=url.searchParams.get('wasm');response.setHeader('content-type','text/html; charset=utf-8');response.end(html);return;}
    const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file=path.resolve(consumerRoot,relative);
    if(!file.startsWith(consumerRoot+path.sep))throw Error('path outside package root');
    if(relative.endsWith('umf_core_wasm_bg.wasm')&&wasmMode==='missing'){response.statusCode=404;response.end('Error');return;}
    if(relative.endsWith('umf_core_wasm_bg.wasm')&&wasmMode==='corrupt'){response.setHeader('content-type','application/wasm');response.end(Buffer.alloc(64));return;}
    const bytes=await readFile(file);
    response.setHeader('content-type',relative.endsWith('.js')?'text/javascript; charset=utf-8':relative.endsWith('.wasm')?'application/wasm':'application/octet-stream');
    response.end(bytes);
  }catch(error){response.statusCode=404;response.end(String(error));}
});
let wasmMode=null;
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../');
const require=createRequire(path.join(repoRoot,'package.json'));
const {chromium}=require('playwright');
const executablePath=process.env.UMF_CHROMIUM_PATH||'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge';
let browser;
try {
  browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
  const page=await browser.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base);
  await page.waitForFunction(()=>window.result||window.error,{timeout:30000});
  const result=await page.evaluate(()=>window.result??{error:window.error});
  assert.equal(pageErrors.length,0,pageErrors.join('; '));
  assert.equal(result.taggedCases,48);
  assert.equal(result.rawHostRefusals,8);
  assert.equal(result.proxyTraps,0);
  assert.equal(result.getterCalls,0);
  assert.equal(result.date9.utf16Length,10);
  assert.deepEqual(result.date9.codeUnits,[65298,65296,65298,65300,45,48,49,45,48,49]);

  const controls=[];
  for(const mode of ['missing','corrupt']) {
    const control=await browser.newPage();
    await control.goto(`${base}/?wasm=${mode}`);
    await control.waitForFunction(()=>window.result||window.error,{timeout:30000});
    const outcome=await control.evaluate(()=>window.result??{error:window.error});
    assert.ok(outcome.error,`${mode} WASM must reject initialization`);
    assert.match(outcome.error,/WebAssembly|CompileError|magic/i);
    controls.push({mode,error:outcome.error});
    await control.close();
  }
  console.log(JSON.stringify({engine:'Chromium',version:browser.version(),...result,wasmControls:controls}));
} finally {
  await browser?.close();
  server.close();
}

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {extname,join,resolve} from 'node:path';
import {chromium} from 'playwright';

const archive=resolve(process.argv[2]);
const output=resolve(process.argv[3]);
const temp=await mkdtemp(join(tmpdir(),'umf-csv-adversarial-'));
const pkg=join(temp,'node_modules/@umf/core');await mkdir(pkg,{recursive:true});
const ex=Bun.spawnSync(['tar','-xzf',archive,'--strip-components=1','-C',pkg]);assert.equal(ex.exitCode,0,ex.stderr.toString());
const source=JSON.parse(await readFile(join(pkg,'dist/spec/domain-packs/medical/ontology.json'),'utf8'));
const request=()=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},token:'true'});
const ownError=(route,fn)=>{try{return{status:'accepted',value:fn()}}catch(e){return{status:'refused',name:e?.name??null,constructor:Object.getPrototypeOf(e)?.constructor?.name??null,instanceOfUmfError:typeof route.UmfError==='function'&&e instanceof route.UmfError,code:e?.code??null,path:e?.path??'',message:String(e?.message??e)}}};
const run=(route,base)=>{
 const cases={};
 const sourceAccessor=()=>{const s=structuredClone(base);let reads=0;Object.defineProperty(s,'id',{enumerable:true,configurable:true,get(){reads++;return'hidden'}});return{result:ownError(route,()=>route.validateCsvBooleanLexical(s,request())),getterReads:reads}};
 const nestedAccessor=()=>{const s=structuredClone(base);let reads=0;Object.defineProperty(s.modules[0].elements[0],'name',{enumerable:true,configurable:true,get(){reads++;return'hidden'}});return{result:ownError(route,()=>route.validateCsvBooleanLexical(s,request())),getterReads:reads}};
 const requestAccessor=(key)=>{const r=request();let reads=0;Object.defineProperty(r,key,{enumerable:true,configurable:true,get(){reads++;return key==='profile'?'umf.csv-boolean-lexical/1.0.0':'true'}});return{result:ownError(route,()=>route.validateCsvBooleanLexical(base,r)),getterReads:reads}};
 cases.sourceAccessor=sourceAccessor();cases.nestedSourceAccessor=nestedAccessor();
 cases.requestProfileAccessor=requestAccessor('profile');cases.requestTokenAccessor=requestAccessor('token');cases.requestUnknownAccessor=requestAccessor('future');
 {const s=structuredClone(base);Object.defineProperty(s,'private',{value:1,enumerable:false});cases.hiddenSource=ownError(route,()=>route.validateCsvBooleanLexical(s,request()))}
 {const r=request();Object.defineProperty(r,'private',{value:1,enumerable:false});cases.hiddenRequest=ownError(route,()=>route.validateCsvBooleanLexical(base,r))}
 {const s=structuredClone(base);Object.defineProperty(s,Symbol('hidden'),{value:1,enumerable:true});cases.sourceSymbolKey=ownError(route,()=>route.validateCsvBooleanLexical(s,request()))}
 {const r=request();Object.defineProperty(r,Symbol('hidden'),{value:1,enumerable:true});cases.requestSymbolKey=ownError(route,()=>route.validateCsvBooleanLexical(base,r))}
 {const s=structuredClone(base);let reads=0;Object.defineProperty(s,'id',{enumerable:true,get(){reads++;return'hidden'}});Object.defineProperty(s,'private',{value:1,enumerable:false});cases.competingSourceHidden={result:ownError(route,()=>route.validateCsvBooleanLexical(s,request())),getterReads:reads}}
 {const r=request();let reads=0;Object.defineProperty(r,'futureA',{enumerable:true,get(){reads++;return 1}});Object.defineProperty(r,'futureB',{enumerable:true,get(){reads++;return 2}});cases.competingRequestAccessors={result:ownError(route,()=>route.validateCsvBooleanLexical(base,r)),getterReads:reads}}
 {const s=structuredClone(base);let reads=0;Object.defineProperty(s,'id',{enumerable:true,get(){reads++;return'hidden'}});const r=request();r.profile='future';cases.invalidRequestAgainstSourceAccessor={result:ownError(route,()=>route.validateCsvBooleanLexical(s,r)),getterReads:reads}}
 {const s=new Proxy({}, {ownKeys(){throw new Error('proxy-ownKeys-stop')}});cases.proxyOwnKeysThrow=ownError(route,()=>route.validateCsvBooleanLexical(s,request()))}
 {let descriptors=0;const s=new Proxy({}, {ownKeys(){return['umf']},getOwnPropertyDescriptor(){descriptors++;if(descriptors===1)return{enumerable:true,configurable:true,get(){throw new Error('getter')}};throw new Error('proxy-descriptor-stop')}});cases.proxyDescriptorChanges={result:ownError(route,()=>route.validateCsvBooleanLexical(s,request())),descriptorTrapCalls:descriptors}}
 {let calls=0;const s=new Proxy({}, {ownKeys(){calls++;return calls===1?['umf']:['id']},getOwnPropertyDescriptor(_t,k){return{enumerable:true,configurable:true,get(){return k==='umf'?'0.10.0':'hidden'}}}});cases.proxyChangingKeys={result:ownError(route,()=>route.validateCsvBooleanLexical(s,request())),ownKeysCalls:calls}}
 {const r=new Proxy(request(),{ownKeys(){throw new Error('request-proxy-ownKeys-stop')}});cases.requestProxyOwnKeysThrow=ownError(route,()=>route.validateCsvBooleanLexical(base,r))}
 {const events=[];const s=new Proxy({}, {ownKeys(){events.push('ownKeys');return['umf']},getOwnPropertyDescriptor(_t,k){events.push('descriptor:'+String(k));return{get(){return'0.10.0'},enumerable:true,configurable:true}}});cases.proxyTrapOrder={result:ownError(route,()=>route.validateCsvBooleanLexical(s,request())),events}}
 {const s=structuredClone(base);let sourceReads=0,requestReads=0;Object.defineProperty(s,'id',{enumerable:true,get(){sourceReads++;return'hidden'}});const r=request();Object.defineProperty(r,'token',{enumerable:true,get(){requestReads++;return'true'}});cases.malformedReceiptFirst={result:ownError(route,()=>route.verifyCsvBooleanLexical({},s,r)),sourceGetterReads:sourceReads,requestGetterReads:requestReads}}
 return cases;
};
const canonical=value=>JSON.stringify(value,(key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
const sourcePath=join(temp,'source.json');await writeFile(sourcePath,JSON.stringify(source));
const probe=`import * as root from '@umf/core';import * as reference from '@umf/core/reference';import {readFile} from 'node:fs/promises';const base=JSON.parse(await readFile('./source.json','utf8'));const request=${request.toString()};const ownError=${ownError.toString()};const run=${run.toString()};console.log(JSON.stringify({runtime:typeof Bun!=='undefined'?'Bun '+Bun.version:process.version,default:run(root,base),reference:run(reference,base)}));`;
await writeFile(join(temp,'probe.mjs'),probe);
const exec=async(command)=>{const child=Bun.spawn([command,'probe.mjs'],{cwd:temp,stdout:'pipe',stderr:'pipe'});const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);const code=await child.exited;assert.equal(code,0,`${command} failed\n${stderr}`);return JSON.parse(stdout)};
const node=await exec('node');const bun=await exec('bun');
const html=`<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports:{'@umf/core':'/pkg/dist/umf-browser.js','@umf/core/reference':'/pkg/dist/umf.js'}})}</script><script type="module">import * as root from '@umf/core';import * as reference from '@umf/core/reference';const request=${request.toString()};const ownError=${ownError.toString()};const run=${run.toString()};const base=await(await fetch('/source.json')).json();window.result={default:run(root,base),reference:run(reference,base)};</script>`;
const browserErrors=[];const server=createServer(async(req,res)=>{const path=new URL(req.url??'/', 'http://127.0.0.1').pathname;if(path==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return}if(path==='/source.json'){res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify(source));return}const relative=path==='/pkg'?'.':path.slice('/pkg/'.length);try{const bytes=await readFile(join(pkg,relative));res.writeHead(200,{'content-type':extname(relative)==='.wasm'?'application/wasm':extname(relative)==='.js'?'text/javascript':'application/octet-stream'});res.end(bytes)}catch{res.writeHead(404);res.end('not found')}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert(address&&typeof address!=='string');const browser=await chromium.launch({headless:true});
try{const page=await browser.newPage();page.on('pageerror',e=>browserErrors.push(String(e)));await page.goto(`http://127.0.0.1:${address.port}/`);await page.waitForFunction(()=>Boolean(window.result),undefined,{timeout:60000});const chromiumResult=await page.evaluate(()=>({userAgent:navigator.userAgent,...window.result}));assert.deepEqual(browserErrors,[]);
 const mismatches=rows=>Object.keys(rows.default).filter(key=>canonical(rows.default[key])!==canonical(rows.reference[key]));
 const results={archive,archiveSha256:createHash('sha256').update(await readFile(archive)).digest('hex'),host:{node,bun},chromium:{version:browser.version(),...chromiumResult},mismatches:{node:mismatches(node),bun:mismatches(bun),chromium:mismatches(chromiumResult)},cases:Object.keys(node.default)};
 await writeFile(output,JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results,null,2));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));await rm(temp,{recursive:true,force:true})}

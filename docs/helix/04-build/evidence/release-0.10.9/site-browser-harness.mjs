// SPDX-License-Identifier: MIT OR Apache-2.0
// One local or public Pack Tools UI flow; no catalog-wide replay.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {copyFile,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,sep,extname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const [mode,repoArg,evidenceArg,urlArg,refreshReceiptArg]=process.argv.slice(2);
assert(['local','public'].includes(mode),'usage: local|public SITE_REPO EVIDENCE_DIR [PUBLIC_BASE_URL] [LOCAL_REFRESH_RECEIPT]');
assert(repoArg&&evidenceArg,'SITE_REPO and EVIDENCE_DIR are required');
const repo=resolve(repoArg),evidence=resolve(evidenceArg),site=resolve(repo,'docs/helix/05-deploy/microsite/dist');
const chromiumPath=process.env.UMF_CHROMIUM_PATH;
const {chromium}=createRequire(resolve(repo,'package.json'))('playwright');
const refreshReceipt=refreshReceiptArg?JSON.parse(await readFile(resolve(refreshReceiptArg),'utf8')):undefined;
if(mode==='public')assert(refreshReceipt?.profile==='umf.microsite-local-refresh/1'&&refreshReceipt.version==='0.10.9','public smoke requires the matching local 0.10.9 refresh receipt');
const originRoot=mode==='local'?site:undefined;
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png'};
let server,base;
if(mode==='local'){
 server=createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url??'/', 'http://127.0.0.1').pathname);
  const relative=path==='/'?'/index.html':path;
  const file=resolve(originRoot,'.'+relative);
  if(file===originRoot||!file.startsWith(originRoot+sep)){res.writeHead(404).end();return;}
  try{const body=await readFile(file);res.setHeader('content-type',mime[extname(file)]??'application/octet-stream');res.setHeader('cache-control','no-store');res.end(body);}catch{res.writeHead(404).end();}
 });
 await new Promise(done=>server.listen({host:'127.0.0.1',port:0},done));
 const address=server.address();assert(address&&typeof address!=='string');base=new URL(`http://127.0.0.1:${address.port}/`);
}else base=new URL(urlArg??'https://documentdrivendx.github.io/umf/');

const external=[],presentationFonts=[],unexpectedExternal=[],compilerExternal=[],pageErrors=[];
const declaredFont=new URL('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500;600;700&display=swap').href;
let phase='homepage',browser;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
try{
 await mkdir(evidence,{recursive:true});
 browser=await chromium.launch({headless:true,...(chromiumPath?{executablePath:chromiumPath}:{})});
 const page=await browser.newPage({acceptDownloads:true});page.on('pageerror',e=>pageErrors.push(String(e)));
 await page.route('**/*',route=>{
  const url=route.request().url();if(new URL(url).origin===base.origin)return route.continue();
  external.push({phase,url});
  if(url===declaredFont&&phase==='homepage'){presentationFonts.push({phase,url,action:'blocked'});return route.abort();}
  unexpectedExternal.push({phase,url});if(phase==='generation')compilerExternal.push({url});return route.abort();
 });
 await page.goto(base.href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.locator('a[href="pack-tools.html"]').first().waitFor({state:'visible'});
 phase='workbench-load';
 await page.goto(new URL('pack-tools.html?pack=pack:legal-appellate@1.1.0',base).href,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.querySelector('#generation-status')?.textContent?.includes('domain packs loaded'),undefined,{timeout:60000});
 const provenancePath=mode==='local'?resolve(site,'assets/pack-tools/provenance.json'):undefined;
 let provenanceText,provenance;
 if(provenancePath){provenanceText=await readFile(provenancePath,'utf8');provenance=JSON.parse(provenanceText);}
 else {const remote=await page.evaluate(async()=>{const r=await fetch('assets/pack-tools/provenance.json');if(!r.ok)throw Error('public Pack Tools provenance unavailable');return r.text();});provenanceText=remote;provenance=JSON.parse(remote);}
 if(refreshReceipt?.siteProvenance?.wasm)assert.deepEqual(provenance.wasm,refreshReceipt.siteProvenance.wasm,'deployed runtime hashes differ from locally refreshed runtime');
 const selected=await page.locator('#pack-choice-status').textContent();assert.match(selected??'',/legal-appellate/i);assert((selected??'').includes('1.1.0'));
 phase='generation';
 await page.getByRole('button',{name:'Generate pack tools',exact:true}).click();
 await page.waitForSelector('#generation-results:not([hidden]) .result-badge',{timeout:120000});
 const inspect=async(tab,needle)=>{await page.getByRole('tab',{name:tab,exact:true}).click();const text=await page.locator('#output-panel pre').textContent();assert(text?.includes(needle),`${tab} preview does not include ${needle}`);return text;};
 const ddl=await inspect('PostgreSQL DDL','CREATE TABLE');
 const orm=await inspect('SQLAlchemy models','DeclarativeBase');
 const crud=await inspect('Python CRUD','session.flush()');
 const individualEvent=page.waitForEvent('download');
 await page.locator('#output-panel').getByRole('button',{name:'Download',exact:true}).click();
 const individual=await individualEvent,individualPath=resolve(evidence,'crud.py');await individual.saveAs(individualPath);
 const individualBytes=await readFile(individualPath);assert(individualBytes.equals(Buffer.from(crud,'utf8')),'CRUD download differs from its preview');
 const downloadHashes=await page.locator('.artifact-row').evaluateAll(rows=>Object.fromEntries(rows.map(row=>[row.querySelector('strong').textContent,row.querySelector('small').textContent.match(/SHA-256 ([a-f0-9]{64})/)[1]])));
 await writeFile(resolve(evidence,'download-hashes.json'),JSON.stringify(downloadHashes)+'\n');
 const zipEvent=page.waitForEvent('download');await page.getByRole('button',{name:/Download all .*files/}).click();
 const zipDownload=await zipEvent,zipPath=resolve(evidence,'legal_appellate-pack-tools.zip');await zipDownload.saveAs(zipPath);
 const validationDir=resolve(evidence,'validator-input');await mkdir(validationDir,{recursive:true});
 await copyFile(zipPath,resolve(validationDir,'commerce.zip'));
 await copyFile(resolve(evidence,'download-hashes.json'),resolve(validationDir,'download-hashes.json'));
 const validator=spawnSync(process.env.UMF_PYTHON??'/opt/homebrew/bin/python3.14',[resolve(repo,'scripts/pack-tools/validate_downloads.py'),validationDir],{encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});
 if(validator.status!==0)throw Error(validator.stderr||validator.stdout||'ZIP displayed hashes/membership/CRC validation failed');
 if(unexpectedExternal.length||compilerExternal.length||pageErrors.length)throw Error(JSON.stringify({unexpectedExternal,compilerExternal,pageErrors}));
 const provenanceBytes=Buffer.from(provenanceText);
 const receipt={profile:'umf.microsite.one-request-flow/1',status:'passed',mode,baseUrl:base.href,pack:'legal-appellate@1.1.0',browser:browser.version(),siteProvenanceSha256:hash(provenanceBytes),siteRuntime:provenance?.wasm,checks:{deployedRuntimeMatchesLocalRefresh:!refreshReceipt?.siteProvenance?.wasm||JSON.stringify(provenance.wasm)===JSON.stringify(refreshReceipt.siteProvenance.wasm),ddlPreview:ddl.includes('CREATE TABLE'),ormPreview:orm.includes('DeclarativeBase'),crudPreview:crud.includes('session.flush()'),individualDownloadByteEquality:true,zipHashesMembershipAndCrc:validator.stdout.trim(),compilerExternalRequests:compilerExternal.length,unexpectedExternalRequests:unexpectedExternal.length,pageErrors:pageErrors.length},presentationRequests:{declaredGoogleFontsCss:presentationFonts},downloads:{individual:{path:'crud.py',bytes:individualBytes.length,sha256:hash(individualBytes)},zip:{path:'legal_appellate-pack-tools.zip',bytes:(await readFile(zipPath)).length,sha256:hash(await readFile(zipPath)),validatedAs:'commerce.zip alias for unchanged validator input contract'}}};
 await writeFile(resolve(evidence,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify({status:'passed',mode,pack:receipt.pack,browser:receipt.browser,compilerExternalRequests:0,unexpectedExternalRequests:0,receipt:resolve(evidence,'receipt.json')}));
}finally{await browser?.close();if(server)await new Promise(done=>server.close(done));}

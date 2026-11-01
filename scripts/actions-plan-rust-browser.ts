// SPDX-License-Identifier: MIT OR Apache-2.0
// Exercise the distributed browser entry point. Build the SDK separately and
// pass its dist directory; serve its real WASM and JavaScript assets locally.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {chromium} from 'playwright';

assert(process.argv[2], 'Pass the built SDK dist directory');
const sdk = resolve(process.argv[2]);
await Promise.all(['umf-browser.js', 'umf_core_wasm_bg.wasm'].map(file => readFile(resolve(sdk, file))));
const fixture = JSON.parse(await readFile(new URL('../docs/helix/03-test/fixtures/bulk-update/model.json', import.meta.url), 'utf8'));
assert.equal(fixture.umf, '0.10.0', 'Action Plan fixture must pin the current core version');

const entry = `
import * as api from '/sdk/umf-browser.js';
const check=(condition,message)=>{if(!condition)throw Error(message);};
const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
const artifact=async value=>{const utf8=JSON.stringify(value);return {mediaType:'application/json',utf8,sha256:await digest(utf8)};};
const document=${JSON.stringify(fixture)};
const model=await artifact(document);
const pin={documentId:document.id,revision:'browser1',umfVersion:document.umf,sha256:model.sha256};
const action={identity:{module:'sales',action:'set-active'},documentSha256:model.sha256,invocation:{id:'umf.actions.tx',version:'1'}};
const field={module:'sales',element:'last-seen'};
const context={registry:api.createUmfRegistry(),models:[{pin,artifact:model}],actions:[{pin:action,artifact:model}],selections:[{profile:{id:'test.selection',version:'1'},inspect:()=>({eligible:true,dependencies:[field],diagnostics:[]})}]};
const plan={protocol:'umf.actions.plan/1',model:pin,action,source:await artifact({sql:'UPDATE Customer SET active=FALSE WHERE last_seen<100'}),selection:{profile:{id:'test.selection',version:'1'},artifact:await artifact({field,value:{integerToken:'100'}}),dependencies:[field]},target:{module:'sales',element:'customer',key:'pk'},inputs:{entityParameter:'customer',assignments:[{input:'active-value',field:{module:'sales',element:'active'},value:{boolean:false}}]},execution:{selection:'frozen',atomicity:'batch',conflict:'stop',partition:'manifest-order',batchSize:2},limits:{maxItems:10000,maxManifestBytes:16777216}};
const prepared=api.prepareActionPlanModel(pin,action,context);
const inspected=api.inspectActionPlan(await artifact(plan),context);
const identity={module:'sales',element:'customer',key:'pk'};
const entity={key:plan.target,components:[{string:'browser-customer-17'}]};
const keyReceipt=api.prepareCoreKeyTuples(document).encode(identity,entity.components);
const construction={plan:await artifact(plan),action:{target:{module:'sales',action:'set-active',revision:'browser1'},documentSha256:action.documentSha256,invocation:action.invocation},basis:{profile:{id:'test.snapshot',version:'1'},store:'store-a',epoch:'epoch-a',cut:'cut-a',selectionSha256:plan.selection.artifact.sha256},rows:[{entity,guard:{profile:{id:'test.guard',version:'1'},store:'store-a',epoch:'epoch-a',identity:'browser-customer-17',version:'version-1'},keyReceipt}]};
const constructed=api.constructActionManifest(construction,context);
const manifestInspection=api.inspectActionManifest(constructed.artifact,context);
const claimIds={plan:['integrity','actionBinding'],selection:['interpretation','completeRead'],manifest:['partition','sealCustody'],guard:['identityVersion'],snapshot:['coherentCut'],bulk:['atomicBatch','replay','principal','recovery','cancel','retention']};
const profiles={plan:{id:'umf.actions.plan',version:'1'},selection:plan.selection.profile,manifest:{id:'umf.actions.manifest',version:'1'},bulk:{id:'umf.actions.bulk',version:'1'},guard:{id:'test.guard',version:'1'},snapshot:{id:'test.snapshot',version:'1'}};
const capabilities={};for(const [family,ids] of Object.entries(claimIds))capabilities[family]={profile:profiles[family],claims:ids.map(id=>({id:family+'.'+id,status:'supported',evidence:['fixture://declaration-only']}))};
capabilities.action={id:'browser-executor',version:'1',coreVersion:document.umf,actionVersion:'0.1.0',source:structuredClone(document),identity:action.identity,claims:api.inspectActions(structuredClone(document),context.registry).actions[0].obligations.map(item=>({obligation:item.id,status:'supported',evidence:['fixture://declaration-only']}))};
const manifestAssessment=api.assessActionManifest(manifestInspection,capabilities,context);
const forged={...manifestInspection,eligible:false};
const manifestRefused=api.assessActionManifest(forged,capabilities,context);
plan.selection.dependencies=[{module:'sales',element:'active'}];
const refused=api.inspectActionPlan(await artifact(plan),context);
window.umfResult={frame:JSON.parse(prepared.utf8).frames[0],eligible:inspected.eligible,refused:!refused.eligible,refusal:refused.diagnostics.some(item=>item.code==='PAP_ACTION'),manifestEligible:manifestInspection.eligible,manifestCompatible:manifestAssessment.compatible,manifestRefused:!manifestRefused.compatible,sealed:constructed.sealed,nodeGlobals:typeof process!=='undefined'||typeof Buffer!=='undefined'};
`;

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
  if (pathname === '/') {
    response.setHeader('content-type', 'text/html');
    return response.end('<!doctype html><script type="module" src="/entry.js"></script>');
  }
  if (pathname === '/entry.js') {
    response.setHeader('content-type', 'text/javascript');
    return response.end(entry);
  }
  if (pathname.startsWith('/sdk/')) {
    const file = resolve(sdk, decodeURIComponent(pathname.slice('/sdk/'.length)));
    if (file.startsWith(sdk + sep)) {
      try {
        const body = await readFile(file);
        response.setHeader('content-type', file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript');
        return response.end(body);
      } catch {}
    }
  }
  response.writeHead(404);
  response.end('not found');
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
let browser;
try {
  const address = server.address();
  assert(address && typeof address !== 'string');
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') { external.push(url.href); return route.abort(); }
    return route.continue();
  });
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await Promise.race([
    page.waitForFunction(() => window.umfResult, undefined, {timeout: 30000}),
    new Promise((_, reject) => page.once('pageerror', reject)),
  ]);
  assert.deepEqual(errors, []);
  assert.deepEqual(external, []);
  const result = await page.evaluate(() => window.umfResult);
  assert.deepEqual(result, {frame: 'customer-write', eligible: true, refused: true, refusal: true, manifestEligible:true, manifestCompatible:true, manifestRefused:true, sealed:false, nodeGlobals: false});
  console.log(JSON.stringify({browser: browser.version(), ...result, passed: true}));
} finally {
  await browser?.close();
  await new Promise(done => server.close(done));
}

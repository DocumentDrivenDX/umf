// SPDX-License-Identifier: MIT OR Apache-2.0
/** Exercise the additive production compiler binding in actual Chromium. */
import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, dirname, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {gunzipSync} from 'node:zlib';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const fixture = process.env.UMF_R3_FIXTURE ?? 'docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json';
const pkg = process.env.UMF_WASM_PKG_PATH ?? 'target/rust-codegen/wasm/pkg/umf_core_wasm.js';
const output = process.env.UMF_R3_REPORT ?? '/private/tmp/umf-r3-chromium.json';
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    const target = resolve(root, `.${path}`);
    if (target !== root && !target.startsWith(root + sep)) throw new Error('outside root');
    if (target === root) { response.writeHead(200, {'content-type': 'text/html'}); response.end('<!doctype html><title>Rust compiler qualification</title>'); return; }
    const raw = await readFile(target);
    const body = target.endsWith('.gz') ? gunzipSync(raw) : raw;
    response.writeHead(200, {'content-type': extname(target) === '.wasm' ? 'application/wasm' : extname(target) === '.js' ? 'text/javascript' : 'application/json', 'cache-control': 'no-store'});
    response.end(body);
  } catch { response.writeHead(404); response.end('not found'); }
});
await new Promise<void>((accept) => server.listen(0, '127.0.0.1', accept));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No browser qualification server');
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = `http://127.0.0.1:${address.port}`;
  await page.goto(origin);
  const result = await page.evaluate(async ({origin, fixture, pkg}) => {
    const get = async (path: string) => { const response = await fetch(`${origin}/${path}`); if (!response.ok) throw new Error(path); return response.json(); };
    const paths = {coreSchema:'spec/core/schema.json', referenceSchema:'spec/core/semantic-type-reference.schema.json', packageSchema:'spec/core/extension-package.schema.json', constraints:'spec/metamodel/generated/core-constraints.json', domainPolicy:'spec/metamodel/generated/domain-policy.json', tablesPackage:'spec/extensions/tables/package.json', actionsPackage:'spec/extensions/actions/package.json',bindingPackage:'spec/extensions/binding/package.json',stableBindingPackage:'spec/extensions/binding-stable/package.json'};
    const resources = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([name, path]) => [name, await get(path)])));
    const corpus = await get(fixture);
    const rows = corpus.cases ?? [...corpus.vectors, ...corpus.diffs];
    if (!rows.length || new Set(rows.map((row: any) => row.id)).size !== rows.length) throw new Error('Expected nonempty corpus with unique IDs');
    const glue = await import(`${origin}/bindings/core/wasm/index.js`);
    const module = await import(`${origin}/${pkg}`); await module.default();
    const engine = glue.createCodegenEngine(module, resources);
    const canonical = (value: any): string => value && typeof value === 'object' ? Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
    const results = rows.map((row: any) => { const actual = engine.call(row.operation, row.request); return {id:row.id, matches:canonical(actual) === canonical(row.expected), actual}; });
    const controls: Record<string,string> = {};
    for (const [name, options] of Object.entries({budget:{maxWork:0}, cancellation:{isCancelled:()=>true}, deadline:{now:()=>2,deadlineMs:1}, meter:{meter:()=>{throw new Error('compiler meter failure');}}})) {
      try { glue.createCodegenEngine(module, resources, {controls:options}).call('compileTableDeployment', {}); controls[name]='NO_FAILURE'; }
      catch (error: any) { controls[name]=error.code; }
    }
    try { glue.createCodegenEngine(module, resources, {profile:'hard-isolated'}); controls.isolated='NO_FAILURE'; }
    catch (error: any) { controls.isolated=error.code; }
    const controlCorpus=await get('docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json');
    const sample=controlCorpus.cases.find((row:any)=>row.operation==='generatePythonClient'&&row.expected.ok);
    if(!sample)throw new Error('No successful baseline compiler fixture for late controls');
    let active=false,charged=0,stop=Infinity,mode='observe';
    const controlled=glue.createCodegenEngine(module,resources,{controls:{meter:(amount:number)=>{if(active){charged+=amount;if(mode==='meter'&&charged>stop)throw new Error('late meter');}},isCancelled:()=>active&&mode==='cancel'&&charged>stop,now:()=>active&&mode==='deadline'&&charged>stop?2:0,deadlineMs:1}});
    active=true;controlled.call(sample.operation,sample.request);const total=charged;
    for(const policy of ['meter','cancel','deadline']){
      mode=policy;charged=0;stop=Math.floor(total*0.75);
      try{controlled.call(sample.operation,sample.request);controls['late-'+policy]='NO_FAILURE';}
      catch(error:any){controls['late-'+policy]=error.code;}
      if(!(charged>stop&&charged<total))throw new Error('Late control did not interrupt measured work: '+policy);
    }
    return {cases:rows.length, matches:results.filter((row: any)=>row.matches).length, controls, results};
  }, {origin, fixture, pkg});
  const passed = result.matches === result.cases && result.controls.budget === 'RESOURCE_LIMIT' && result.controls.cancellation === 'CANCELLED' && result.controls.deadline === 'DEADLINE' && result.controls.meter === 'METER_FAILURE' && result.controls.isolated === 'RESOURCE_PROFILE_UNAVAILABLE' && result.controls['late-meter'] === 'METER_FAILURE' && result.controls['late-cancel'] === 'CANCELLED' && result.controls['late-deadline'] === 'DEADLINE' && !errors.length;
  await writeFile(output, JSON.stringify({scope:'Incremental actual Chromium compiler binding replay; final source cohort recorded separately', browser:browser.version(), fixture, pkg, passed, pageErrors:errors, ...result})+'\n');
  console.log(JSON.stringify({passed,cases:result.cases,matches:result.matches,controls:result.controls,output}));
  if (!passed) process.exitCode=1;
} finally { await browser?.close(); await new Promise<void>((accept,reject)=>server.close(error=>error?reject(error):accept())); }

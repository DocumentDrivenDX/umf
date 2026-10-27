// Installed archive extension for the two CONTRACT-053 CSV Boolean operations.
// Private, scoped evidence only. Run from repository root after the archive is built.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {cp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';
import {runCsvBooleanRetirementCases} from './csv-boolean-retirement-cases.mjs';

const archive = resolve(process.argv[2] ?? '');
const output = process.argv[3] ? resolve(process.argv[3]) : null;
if (!process.argv[2]) throw new Error('Usage: bun csv-boolean-retirement-installed.mjs <umf-sdk.tgz> [receipt.json]');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value, (key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(name => [name, item[name]])) : item);
const temp = join(tmpdir(), `umf-csv-retirement-${process.pid}-${Date.now()}`);
const root = join(temp, 'node_modules/@umf/core');
const run = async (command, args, cwd = temp) => {
  const child = spawnSync(command, args, {cwd, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 * 1024 * 1024});
  return {code: child.status ?? -1, stdout: (child.stdout ?? '').trim(), stderr: (child.stderr ?? child.error?.message ?? '').trim()};
};
const assertPass = (result, label) => assert.equal(result.code, 0, `${label} failed (${result.code})\n${result.stdout}\n${result.stderr}`);
let server, browser;
try {
  await mkdir(root, {recursive: true});
  assertPass(await run('tar', ['-xzf', archive, '--strip-components=1', '-C', root]), 'archive extraction');
  const archiveBytes = await readFile(archive);
  const manifestBytes = await readFile(join(root, 'manifest.json'));
  const manifest = JSON.parse(manifestBytes);
  const sdk = JSON.parse(await readFile(join(root, 'dist/rust-default-manifest.json'), 'utf8'));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.profile, 'umf.sdk.distribution.rust-default/1');
  assert.equal(manifest.releaseStatus, 'private-r7-default-route-qualification-not-publishable');
  assert.equal(manifest.sourceTransformStatus, 'fixed-point');
  assert.equal(manifest.sourceTreeSha256, manifest.capturedLiveSourceTreeSha256);
  assert.equal(sdk.sourceClosure.sha256, sdk.sourceClosure.capturedLiveSha256);
  assert.equal(pkg.exports['.'].node, './dist/umf-node.js');
  assert.equal(pkg.exports['.'].browser, './dist/umf-browser.js');
  assert.equal(pkg.exports['./reference'].import, './dist/umf.js');
  for (const [name, digest] of Object.entries(manifest.sha256)) assert.equal(sha256(await readFile(join(root, name))), digest, `archive member ${name}`);
  const source = JSON.parse(await readFile(join(root, 'dist/spec/domain-packs/medical/ontology.json'), 'utf8'));
  const modulePath = new URL('./csv-boolean-retirement-cases.mjs', import.meta.url);
  const moduleBytes = await readFile(modulePath);
  await writeFile(join(temp, 'cases.mjs'), moduleBytes);
  const probe = `import assert from 'node:assert/strict';import * as selected from '@umf/core';import * as reference from '@umf/core/reference';import {readFile} from 'node:fs/promises';import {runCsvBooleanRetirementCases} from './cases.mjs';const source=JSON.parse(await readFile('./source.json','utf8'));const canonical=${canonical.toString()};assert(import.meta.resolve('@umf/core').endsWith('/dist/umf-node.js'));assert(import.meta.resolve('@umf/core/reference').endsWith('/dist/umf.js'));const a=runCsvBooleanRetirementCases(selected,source);const b=runCsvBooleanRetirementCases(reference,source);assert.equal(canonical(a),canonical(b),'default/reference extension cases differ');const runtime=typeof Bun==='undefined'?{name:'Node',version:process.version}:{name:'Bun',version:Bun.version,nodeCompatibilityVersion:process.version};console.log(JSON.stringify({runtime,selected:import.meta.resolve('@umf/core'),reference:import.meta.resolve('@umf/core/reference'),cases:a}));`;
  await writeFile(join(temp, 'probe.mjs'), probe);
  await writeFile(join(temp, 'source.json'), JSON.stringify(source));
  const node = await run('node', ['probe.mjs']); assertPass(node, 'Node installed extension');
  const bun = await run('bun', ['probe.mjs']); assertPass(bun, 'Bun installed extension');

  const browserProbe = `import * as selected from '@umf/core';import * as reference from '@umf/core/reference';import {runCsvBooleanRetirementCases} from './cases.mjs';const source=await(await fetch('/source.json')).json();const canonical=${canonical.toString()};const a=runCsvBooleanRetirementCases(selected,source);const b=runCsvBooleanRetirementCases(reference,source);if(canonical(a)!==canonical(b))throw new Error('default/reference extension cases differ');if(typeof process!=='undefined'||typeof Buffer!=='undefined')throw new Error('Node globals present');window.csvRetirement={cases:a,selected:'@umf/core',reference:'@umf/core/reference'};`;
  const html = `<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify({imports: {'@umf/core': '/node_modules/@umf/core/dist/umf-browser.js', '@umf/core/reference': '/node_modules/@umf/core/dist/umf.js'}})}</script><script type="module" src="/browser-probe.js"></script>`;
  const requests = [], pageErrors = [];
  server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const relative = path === '/' ? 'index.html' : path.slice(1);
    requests.push(relative);
    if (relative === 'index.html') { res.writeHead(200, {'content-type': 'text/html'}); res.end(html); return; }
    if (relative === 'browser-probe.js') { res.writeHead(200, {'content-type': 'text/javascript'}); res.end(browserProbe); return; }
    if (relative === 'source.json') { res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify(source)); return; }
    try { const data = await readFile(join(temp, relative)); res.writeHead(200, {'content-type': extname(relative) === '.wasm' ? 'application/wasm' : extname(relative) === '.js' || extname(relative) === '.mjs' ? 'text/javascript' : 'application/octet-stream'}); res.end(data); }
    catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const address = server.address(); assert(address && typeof address !== 'string');
  browser = await chromium.launch({headless: true}); const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${address.port}/`);
  await page.waitForFunction(() => Boolean(window.csvRetirement), undefined, {timeout: 240000});
  const browserResult = await page.evaluate(() => ({...window.csvRetirement, userAgent: navigator.userAgent}));
  assert.deepEqual(pageErrors, []);
  assert(requests.includes('node_modules/@umf/core/dist/umf_core_wasm_bg.wasm'), 'browser did not request packaged WASM');
  const receipt = {
    format: 'umf.r8.csv-boolean-retirement-extension/1', status: 'pass', scope: ['validateCsvBooleanLexical', 'verifyCsvBooleanLexical'],
    capturedSourceRevision: '4c3187be9',
    archive: {path: archive, sha256: sha256(archiveBytes), bytes: archiveBytes.length, manifestSha256: sha256(manifestBytes)},
    sourceClosure: {sha256: sdk.sourceClosure.sha256, capturedLiveSha256: sdk.sourceClosure.capturedLiveSha256, fileCount: sdk.sourceClosure.fileCount, transform: sdk.sourceClosure.transform},
    packageRoutes: {node: pkg.exports['.'].node, browser: pkg.exports['.'].browser, reference: pkg.exports['./reference'].import},
    node: JSON.parse(node.stdout), bun: JSON.parse(bun.stdout),
    chromium: {version: browser.version(), userAgent: browserResult.userAgent, cases: browserResult.cases, wasmRequested: true},
    harnessSha256: sha256(await readFile(new URL(import.meta.url))), casesSha256: sha256(moduleBytes),
    qualification: 'Private contract-derived extension evidence for these two exports only. Does not retire ledger rows or qualify wider CSV/SDK/release behavior.',
  };
  if (output) { await mkdir(resolve(output, '..'), {recursive: true}); await writeFile(output, JSON.stringify(receipt, null, 2) + '\n'); }
  console.log(JSON.stringify(receipt, null, 2));
} finally {
  await browser?.close(); if (server) await new Promise(done => server.close(done)); await rm(temp, {recursive: true, force: true});
}

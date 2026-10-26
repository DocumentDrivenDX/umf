#!/usr/bin/env node
// Runtime parity for the exact-string extension ID exports through the actual
// default Node/Bun package condition and browser package condition.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cp, copyFile, mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '../../..');
const evidenceRoot = path.resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-extension-id-data');
const distRoot = path.resolve(process.env.UMF_EXTENSION_ID_DATA_DIST ?? path.join(root, 'dist'));
const receipt = JSON.parse(fs.readFileSync(path.join(evidenceRoot, 'receipt.json'), 'utf8'));
const names = receipt.symbols.map(symbol => symbol.exportName);
const expected = Object.fromEntries(receipt.symbols.map(symbol => [symbol.exportName, symbol.value]));
const mode = process.argv[2];
assert.ok(['node', 'bun', 'chromium'].includes(mode), 'usage: extension-id-data-host.mjs node|bun|chromium');

function projection(api) {
  const value = {};
  for (const name of names) {
    assert.ok(Object.hasOwn(api, name), `route must export ${name}`);
    assert.equal(typeof api[name], 'string', `${name} must remain a string primitive`);
    value[name] = api[name];
  }
  return value;
}

if (mode === 'node' || mode === 'bun') {
  const packageRoot = await mkdtemp(path.join(tmpdir(), 'umf-extension-id-package-'));
  try {
    await mkdir(path.join(packageRoot, 'dist'), { recursive: true });
    await cp(distRoot, path.join(packageRoot, 'dist'), { recursive: true });
    await copyFile(path.join(root, 'package.json'), path.join(packageRoot, 'package.json'));
    await symlink(path.join(root, 'node_modules'), path.join(packageRoot, 'node_modules'), 'dir');
    const probePath = path.join(packageRoot, 'host-probe.mjs');
    await writeFile(probePath, `
const expected = ${JSON.stringify(expected)};
const names = Object.keys(expected).sort();
const [rootApi, referenceApi] = await Promise.all([import('@umf/core'), import('@umf/core/reference')]);
const project = api => Object.fromEntries(names.map(name => {
  if (!Object.hasOwn(api, name) || typeof api[name] !== 'string') throw new Error('missing or non-string ' + name);
  return [name, api[name]];
}));
const defaultValues = project(rootApi), referenceValues = project(referenceApi);
if (JSON.stringify(defaultValues) !== JSON.stringify(expected)) throw new Error('default route values differ from current AST');
if (JSON.stringify(referenceValues) !== JSON.stringify(expected)) throw new Error('reference route values differ from current AST');
console.log(JSON.stringify({
  defaultEntry: import.meta.resolve('@umf/core'),
  referenceEntry: import.meta.resolve('@umf/core/reference'),
  exportsChecked: names.length,
  defaultValues, referenceValues,
}));
`);
    const run = spawnSync(process.execPath, [probePath], { cwd: packageRoot, encoding: 'utf8' });
    assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
    const result = JSON.parse(run.stdout.trim());
    assert.deepEqual(result.defaultValues, expected, `${mode} default route AST parity`);
    assert.deepEqual(result.referenceValues, expected, `${mode} reference route AST parity`);
    const payload = {
      format: 'umf.r8.extension-id-host-parity/1',
      status: 'pass',
      host: mode,
      runtime: mode === 'node' ? process.version : Bun.version,
      defaultEntry: result.defaultEntry,
      referenceEntry: result.referenceEntry,
      exportsChecked: names.length,
      defaultAndReferenceEqual: true,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
} else {
  const server = createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      if (pathname === '/') {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<!doctype html><script type="importmap">{"imports":{"@umf/core":"/umf-browser.js","@umf/core/reference":"/umf.js"}}</script><body>R8 extension ID parity</body>');
        return;
      }
      const relativePath = pathname.replace(/^\/+/, '');
      const file = resolve(distRoot, relativePath);
      if (!file.startsWith(`${distRoot}${sep}`)) throw new Error('path traversal');
      const bytes = fs.readFileSync(file);
      const extension = extname(file);
      const contentType = extension === '.wasm' ? 'application/wasm' : extension === '.js' ? 'text/javascript' : 'application/octet-stream';
      response.writeHead(200, { 'content-type': contentType });
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end('not found');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, timeout: 30_000, ...(process.env.UMF_CHROMIUM_PATH ? { executablePath: process.env.UMF_CHROMIUM_PATH } : {}) });
    const page = await browser.newPage();
    const externalRequests = [];
    await page.route('**/*', route => {
      if (!route.request().url().startsWith(`http://127.0.0.1:${server.address().port}/`)) {
        externalRequests.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async expectedValues => {
      const [rootApi, referenceApi] = await Promise.all([import('@umf/core'), import('@umf/core/reference')]);
      const project = api => Object.fromEntries(Object.keys(expectedValues).sort().map(name => {
        if (!Object.hasOwn(api, name) || typeof api[name] !== 'string') throw new Error(`missing or non-string ${name}`);
        return [name, api[name]];
      }));
      return {
        defaultValues: project(rootApi),
        referenceValues: project(referenceApi),
        nodeGlobalsAbsent: !('process' in globalThis) && !('Buffer' in globalThis),
      };
    }, expected);
    assert.deepEqual(result.defaultValues, expected, 'Chromium default browser route AST parity');
    assert.deepEqual(result.referenceValues, expected, 'Chromium reference route AST parity');
    assert.deepEqual(result.defaultValues, result.referenceValues, 'Chromium default/reference parity');
    assert.equal(result.nodeGlobalsAbsent, true, 'browser route must not rely on Node globals');
    assert.deepEqual(externalRequests, [], 'browser route must remain self-contained');
    process.stdout.write(`${JSON.stringify({
      format: 'umf.r8.extension-id-host-parity/1',
      status: 'pass',
      host: 'chromium',
      browser: browser.version(),
      defaultEntry: 'package.json browser -> dist/umf-browser.js',
      referenceEntry: 'package.json ./reference -> dist/umf.js',
      exportsChecked: names.length,
      defaultAndReferenceEqual: true,
      nodeGlobalsAbsent: result.nodeGlobalsAbsent,
      externalRequests: externalRequests.length,
    }, null, 2)}\n`);
  } finally {
    await browser?.close();
    server.close();
  }
}

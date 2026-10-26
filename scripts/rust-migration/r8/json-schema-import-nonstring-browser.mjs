// SPDX-License-Identifier: MIT OR Apache-2.0
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
const output = '/private/tmp/umf-json-schema-nonstring-browser';
const built = await Bun.build({entrypoints: ['scripts/rust-migration/r8/json-schema-import-nonstring-browser-entry.ts'], target: 'browser', format: 'esm', outdir: output});
if (!built.success) throw new Error(built.logs.map(item => item.message).join('\n'));
const source = await readFile(`${output}/json-schema-import-nonstring-browser-entry.js`, 'utf8');
const browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto('about:blank');
  await page.evaluate(async source => import(URL.createObjectURL(new Blob([source], {type: 'text/javascript'}))), source);
  const cases = await page.evaluate(() => window.nonStringImportResult);
  if (errors.length) throw new Error(`Chromium page errors: ${errors.join('; ')}`);
  process.stdout.write(JSON.stringify({runtime: {chromium: browser.version()}, cases}, null, 2) + '\n');
} finally { await browser.close(); }

// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const packageDir = Bun.env.UMF_WORKFLOW_WASM_DIR ?? 'bindings/core/wasm/pkg';
const fixture = Bun.file('crates/umf-core/tests/fixtures/workflow/reply.json');
const moduleName = 'umf_core_wasm';
const assets: Record<string, [string, string]> = {
  '/workflow.js': [`${packageDir}/${moduleName}.js`, 'text/javascript'],
  [`/${moduleName}_bg.wasm`]: [`${packageDir}/${moduleName}_bg.wasm`, 'application/wasm'],
  '/binding.js': ['bindings/core/wasm/index.js', 'text/javascript'],
  '/loader.js': ['bindings/core/wasm/loader.js', 'text/javascript'],
};
const origin = 'https://workflow.test';
const browser = await chromium.launch({
  headless: true,
  ...(Bun.env.UMF_CHROMIUM_PATH ? { executablePath: Bun.env.UMF_CHROMIUM_PATH } : {}),
});
try {
    const page = await browser.newPage();
    await page.route(`${origin}/**`, async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') {
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Workflow conformance</title>' });
      }
      if (path === '/reply.json') {
        return route.fulfill({ contentType: 'application/json', body: await fixture.text() });
      }
      const asset = assets[path];
      if (asset) return route.fulfill({ contentType: asset[1], path: asset[0] });
      if (path.startsWith('/src/')) {
        return route.fulfill({ contentType: 'text/javascript', path: `bindings/core/wasm${path}` });
      }
      return route.fulfill({ status: 404 });
    });
    await page.goto(origin);
    const results = await page.evaluate(async () => {
      const modulePath = '/workflow.js', bindingPath = '/binding.js';
      const wasm = await import(modulePath);
      await wasm.default();
      const { createWorkflowEngine } = await import(bindingPath);
      const engine = createWorkflowEngine(wasm);
      const original = await (await fetch('/reply.json')).text();
      const encode = (text: string) => new TextEncoder().encode(text);
      const bytes = encode(original);
      const unknown = original.replace('"kind": "count"', '"kind": "count", "unknown": 900719925474099300001');
      const equivalent = original.replace('{"kind": "count", "count": "90", "unit": "fixed-day"}', '{"kind": "elapsed", "text": "PT2160H"}');
      const cycle = original.replace('"timeout": "expired"', '"timeout": "send"');
      const accepted = engine.compileWorkflow(bytes, 'umf.workflow.correlated/1');
      const inspected = engine.inspectWorkflow(encode(unknown));
      return {
        accepted,
        equivalent: engine.compileWorkflow(encode(equivalent), 'umf.workflow.correlated/1'),
        pristine: engine.inspectWorkflow(bytes),
        inspected,
        exactUnknown: inspected.ok && inspected.value.source === unknown,
        refused: engine.compileWorkflow(encode(unknown), 'umf.workflow.correlated/1'),
        cyclic: engine.compileWorkflow(encode(cycle), 'umf.workflow.correlated/1'),
        duration: engine.parseElapsedDuration('PT0.000000001S'),
        calendar: engine.parseElapsedDuration('P1M'),
      };
    });
    assert(results.accepted.ok && results.accepted.value.entry === 'send');
    assert(results.equivalent.ok);
    assert.notEqual(results.accepted.value.sourceDigest, results.equivalent.value.sourceDigest);
    assert.equal(results.accepted.value.definitionDigest, results.equivalent.value.definitionDigest);
    assert(results.pristine.ok && results.pristine.value.complete);
    assert(results.inspected.ok && !results.inspected.value.complete && results.exactUnknown);
    assert.equal(results.refused.findings[0].path, '/steps/1/for/unknown');
    assert.equal(results.cyclic.findings[0].code, 'CYCLE');
    assert.equal(results.duration.value.nanoseconds, '1');
    assert.equal(results.calendar.ok, false);
    console.log(`Workflow browser checks passed in Chromium ${browser.version()}`);
} finally {
    await browser.close();
}

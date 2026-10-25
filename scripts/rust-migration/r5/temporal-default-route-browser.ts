import {join} from 'node:path';
import {chromium} from 'playwright';

const root = process.env.UMF_TEMPORAL_DEFAULT_BROWSER;
if (!root) throw new Error('Set UMF_TEMPORAL_DEFAULT_BROWSER to the source-built package dist directory');
const server = Bun.serve({hostname: '127.0.0.1', port: 43179, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/') return new Response('<!doctype html><meta charset="utf-8">', {headers: {'content-type': 'text/html'}});
  const file = join(root, path.replace(/^\//, ''));
  try { return new Response(await Bun.file(file).arrayBuffer(), {headers: {'content-type': path.endsWith('.wasm') ? 'application/wasm' : 'text/javascript'}}); }
  catch { return new Response('not found', {status: 404}); }
}});
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const result = await page.evaluate(async () => {
    const api = await import(new URL('/umf-browser.js', location.href).href);
    const expectError = (label: string, run: () => unknown, name: string, message: string) => {
      try { run(); throw new Error(`${label}: accepted invalid input`); }
      catch (error) {
        const actual = error instanceof Error ? error : new Error(String(error));
        if (actual.name !== name || actual.message !== message) throw new Error(`${label}: ${actual.name}:${actual.message}`);
      }
    };
    expectError('date type', () => api.parseGregorianDate(null), 'TypeError', 'Gregorian date requires text');
    expectError('date length', () => api.parseGregorianDate('2026-1-01'), 'RangeError', 'Gregorian date requires ten ASCII characters');
    expectError('date syntax', () => api.parseGregorianDate('2026/01/01'), 'RangeError', 'Gregorian date syntax');
    expectError('date calendar', () => api.parseGregorianDate('2026-02-30'), 'RangeError', 'Gregorian date calendar');
    expectError('date before unit', () => api.truncateGregorianDate('bad', new Proxy({}, {get() { throw new Error('unit trap'); }})), 'RangeError', 'Gregorian date requires ten ASCII characters');
    expectError('instant type', () => api.parseRfc3339ExactInstant(null), 'TypeError', 'RFC3339 exact instant requires text');
    expectError('instant syntax', () => api.parseRfc3339ExactInstant('bad'), 'RangeError', 'RFC3339 exact instant syntax');
    expectError('left before right', () => api.sameRfc3339ExactInstant('bad', new Proxy({}, {get() { throw new Error('right trap'); }})), 'RangeError', 'RFC3339 exact instant syntax');
    for (const value of [undefined, null, 0, true, {}, Object.create(null), new String('x'), new Date(0), new Proxy({}, {get() { throw new Error('trap ran'); }})]) {
      expectError('raw host type', () => api.parseGregorianDate(value), 'TypeError', 'Gregorian date requires text');
    }
    const date = api.parseGregorianDate('2000-02-29');
    if (date.year !== 2000 || date.month !== 2 || date.day !== 29) throw new Error('Gregorian output differs');
    if (api.truncateGregorianDate('2026-08-31', 'quarter') !== '2026-07-01') throw new Error('Gregorian truncation differs');
    const instant = api.parseRfc3339ExactInstant('2024-01-01T00:00:00-00:00');
    if (instant.originalOffset !== '-00:00' || instant.localOffsetKnown !== false) throw new Error('Unknown offset differs');
    if (!api.sameRfc3339ExactInstant('2000-01-01T00:00:00Z', '2000-01-01T01:00:00+01:00')) throw new Error('Instant equality differs');
    return {checks: 17, nodeGlobalsAbsent: !('process' in globalThis) && !('Buffer' in globalThis)};
  });
  if (!result.nodeGlobalsAbsent) throw new Error('Node globals leaked into browser bundle');
  console.log(JSON.stringify({status: 'pass', chromium: browser.version(), ...result}));
} finally { await browser?.close(); server.stop(true); }

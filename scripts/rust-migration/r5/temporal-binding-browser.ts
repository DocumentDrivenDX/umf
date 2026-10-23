import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from 'playwright';

const root = '/private/tmp/umf-r5-temporal';
const fixture = await readFile(join(root, 'fixture.json'), 'utf8');
const server = Bun.serve({hostname: '127.0.0.1', port: 43173, async fetch(request) {
  const path = new URL(request.url).pathname;
  if (path === '/') return new Response('<!doctype html><meta charset="utf-8"><title>Temporal WASM check</title>', {headers: {'content-type': 'text/html'}});
  if (path === '/fixture.json') return new Response(fixture, {headers: {'content-type': 'application/json'}});
  const file = join(root, 'wasm', path);
  try { return new Response(await Bun.file(file).arrayBuffer(), {headers: {'content-type': path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream'}}); }
  catch { return new Response('not found', {status: 404}); }
}});
let browser;
try {
  browser = await chromium.launch({headless: true, ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.port}/`);
  const result = await page.evaluate(async () => {
    const wrapperPath = new URL('/index.js', location.href).href;
    const {initializeTemporalWasm} = await import(wrapperPath);
    const rows = await (await fetch('/fixture.json')).json();
    const engine = await initializeTemporalWasm(undefined, globalThis);
    for (const row of rows) {
      if (row.kind === 'date') {
        const value = engine.parseGregorianDate(row.token);
        if (!Object.isFrozen(value) || value.originalText !== row.token || value.year !== row.year || value.month !== row.month || value.day !== row.day) throw Error('Gregorian result differs');
        for (const unit of ['year', 'quarter', 'month']) if (engine.truncateGregorianDate(row.token, unit) !== row[`${unit}Start`]) throw Error(`truncate ${unit} differs`);
      } else {
        const value = engine.parseRfc3339ExactInstant(row.token);
        for (const key of ['utcSeconds', 'fractionalDigits', 'originalOffset', 'localOffsetKnown']) if (value[key] !== row[key]) throw Error(`${key} differs`);
        if (value.originalText !== row.token || !Object.isFrozen(value)) throw Error('instant source/freeze differs');
      }
    }
    if (!Object.isFrozen(engine)) throw Error('engine is not frozen');
    const errors = [];
    for (const run of [() => engine.parseGregorianDate(1), () => engine.parseGregorianDate('bad'), () => engine.parseRfc3339ExactInstant(null)]) {
      try { run(); throw Error('invalid token accepted'); } catch (error) { if (!(error instanceof TypeError || error instanceof RangeError)) throw error; errors.push(error.name); }
    }
    return {rows: rows.length, errors, profiles: ['umf-gregorian-date/1.0.0', 'umf-rfc3339-exact-instant/1.0.0'], nodeGlobalsAbsent: !('process' in globalThis) && !('Buffer' in globalThis)};
  });
  if (result.rows !== 10 || !result.nodeGlobalsAbsent) throw Error('Chromium temporal binding baseline failed');
  console.log(JSON.stringify({status: 'pass', chromium: browser.version(), ...result}));
} finally { await browser?.close(); server.stop(true); }

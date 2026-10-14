import {chromium} from 'playwright';

const build = await Bun.build({entrypoints: ['src/index.ts'], target: 'browser'});
if (!build.success) throw new Error('Exact instant browser build failed');
const server = Bun.serve({port: 0, hostname: '127.0.0.1', fetch(request) {
 return new URL(request.url).pathname === '/instant.js'
  ? new Response(build.outputs[0], {headers: {'content-type': 'text/javascript'}})
  : new Response('<!doctype html><title>Exact instant check</title>');
}});
const browser = await chromium.launch({headless: true,
 ...(process.env.UMF_CHROMIUM_PATH ? {executablePath: process.env.UMF_CHROMIUM_PATH} : {})});
try {
 const page = await browser.newPage(); await page.goto(`http://127.0.0.1:${server.port}`);
 const result = await page.evaluate(async () => {
  const path = '/instant.js', u = await import(path); let checks = 0;
  const check = (condition: boolean) => {checks++; if (!condition) throw new Error('Instant check ' + checks);};
  check(u.sameRfc3339ExactInstant('2024-01-01T00:00:00.123456789Z', '2023-12-31T19:00:00.1234567890-05:00'));
  check(!u.sameRfc3339ExactInstant('2024-01-01T00:00:00.1234567Z', '2024-01-01T00:00:00.1234568Z'));
  const before = u.parseRfc3339ExactInstant('1969-12-31T23:59:59.5000Z');
  check(before.utcSeconds === '-1' && before.fractionalDigits === '5');
  const unknown = u.parseRfc3339ExactInstant('1970-01-01T00:00:00-00:00');
  check(!unknown.localOffsetKnown && unknown.originalText.endsWith('-00:00'));
  check(u.sameRfc3339ExactInstant(unknown.originalText, '1970-01-01T00:00:00Z'));
  check(u.parseRfc3339ExactInstant('0001-01-01T00:00:00+23:59').utcSeconds === '-62135683140');
  check(u.parseRfc3339ExactInstant('9999-12-31T23:59:59-23:59').utcSeconds === '253402387139');
  for (const token of ['1900-02-29T00:00:00Z', '2016-12-31T23:59:60Z', '2024-01-01T00:00:00Z\n']) {
   let refused = false; try {u.parseRfc3339ExactInstant(token);} catch {refused = true;} check(refused);
  }
  check(typeof (globalThis as any).Bun === 'undefined' && typeof (globalThis as any).process === 'undefined');
  return {checks};
 });
 console.log(JSON.stringify({browser: browser.version(), ...result}));
} finally {await browser.close(); server.stop(true);}

import {createServer} from 'node:http';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';

const [rootArg, portArg = '8787', receiptPath] = process.argv.slice(2);
if (!rootArg || !receiptPath) throw new Error('usage: browser-server.mjs static-root port receipt-path');
const root = resolve(rootArg);
const mime = new Map([['.html', 'text/html'], ['.js', 'text/javascript'], ['.json', 'application/json'], ['.wasm', 'application/wasm']]);
const server = createServer(async (request, response) => {
  try {
    if (request.method === 'POST' && ['/receipt', '/progress', '/controls-receipt'].includes(request.url)) {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const payload = JSON.parse(body.toString('utf8'));
      const destination = request.url === '/receipt' ? receiptPath : request.url === '/controls-receipt' ? `${receiptPath}.controls.json` : `${receiptPath}.progress.json`;
      await writeFile(destination, `${JSON.stringify(payload, null, 2)}\n`);
      response.writeHead(201, {'content-type': 'text/plain'}).end('recorded');
      return;
    }
    if (request.method !== 'GET' || !request.url) { response.writeHead(405).end(); return; }
    const url = new URL(request.url, 'http://127.0.0.1');
    const path = resolve(root, `.${decodeURIComponent(url.pathname)}`);
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    const body = await readFile(path);
    const extension = path.slice(path.lastIndexOf('.'));
    response.writeHead(200, {'content-type': mime.get(extension) ?? 'application/octet-stream'}).end(body);
  } catch (error) {
    response.writeHead(error?.code === 'ENOENT' ? 404 : 500).end(String(error));
  }
});
server.listen(Number(portArg), '127.0.0.1');

import {resolve,sep} from 'node:path';
const root=resolve(import.meta.dir,'dist');
const server=Bun.serve({hostname:'127.0.0.1',port:Number(process.env.UMF_EXPLORER_PORT??4178),async fetch(request){const path=resolve(root,'.'+decodeURIComponent(new URL(request.url).pathname));if(path!==root&&!path.startsWith(root+sep))return new Response('Not found',{status:404});const file=Bun.file(path===root?root+'/index.html':path);return await file.exists()?new Response(file):new Response('Not found',{status:404});}});
console.log(`UMF microsite: http://127.0.0.1:${server.port}/explorer.html`);

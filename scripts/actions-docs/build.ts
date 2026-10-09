import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile,readdir,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {runPortableExample} from './portable-example';
const source='docs/helix/04-build/guides/actions',output='docs/helix/05-deploy/microsite/dist/actions';
const check=process.argv.includes('--check'),refresh=process.argv.includes('--refresh');
const hash=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const order=['index.md','concepts.md','getting-started.md','declarations.md','execution.md','receipts-and-queries.md','formal-analysis.md','api-reference.md','support-and-evidence.md','glossary.md'];
const files=(await readdir(source)).filter(p=>p.endsWith('.md')).sort((a,b)=>order.indexOf(a)-order.indexOf(b));
if(files.length!==order.length||order.some(f=>!files.includes(f)))throw Error('Guide chapter inventory differs');
const titles=new Map<string,string>();for(const f of files)titles.set(f,(await readFile(join(source,f),'utf8')).split('\n')[0]!.replace(/^# /,''));
function href(target:string,file:string):string{
 if(/^https:\/\//.test(target))return target;
 if(target.startsWith('#'))return target;
 if(/^[a-z]+:/i.test(target)||target.includes('"'))throw Error('Unsafe link '+target);
 const [path,anchor]=target.split('#');
 if(path?.endsWith('.md')&&files.includes(path))return path.replace(/\.md$/,'.html')+(anchor?'#'+anchor:'');
 const resolved=resolve(dirname(join(source,file)),path!);
 if(!resolved.startsWith(resolve('.')+'/'))throw Error('Link leaves repository');
 if(!existsSync(resolved))throw Error('Missing repository link '+target+' in '+file);
 return 'https://github.com/DocumentDrivenDX/umf/blob/master/'+resolved.slice(resolve('.').length+1)+(anchor?'#'+anchor:'');
}
function inline(s:string,file:string):string{
 return escape(s).replace(/`([^`]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,url)=>`<a href="${escape(href(url.replaceAll('&amp;','&'),file))}">${label}</a>`);
}
const rendered=new Map<string,string>();
const publicSource=await readFile('src/index.ts','utf8');
const typeLines=publicSource.split('\n').filter(l=>l.startsWith('export type {')&&/extensions\/actions(?:[\/\'\"]|;)/.test(l));
const typeNames=typeLines.flatMap(l=>l.slice(l.indexOf('{')+1,l.indexOf('}')).split(',').map(s=>s.trim())).sort();
const sample=runPortableExample();
const apiDoc=await readFile(join(source,'api-reference.md'),'utf8');
const runtimeNames=publicSource.split('\n').filter(l=>l.startsWith('export {')&&l.includes('extensions/actions')).flatMap(l=>l.slice(l.indexOf('{')+1,l.indexOf('}')).split(',').map(s=>s.trim().replace(/^.* as /,'')));
for(const name of runtimeNames)if(!apiDoc.includes('- '+name))throw Error('Undocumented public action export '+name);
const blocks:Record<string,string>={
 'portable-example':'```ts\n'+(await readFile('scripts/actions-docs/inspect-example.ts','utf8')).trim()+'\n```',
 'portable-output':'```json\n'+JSON.stringify({action:sample.action,valid:sample.valid,complete:sample.complete,businessWrites:sample.businessWrites},null,2)+'\n```',
 'public-types':typeNames.map(n=>'- '+n).join('\n'),
 'evidence-links':'- [Final scoped certificate](../../evidence/actions-certification.md)\n- [Machine-readable certificate](../../evidence/actions-certification.json)\n- [Documentation execution evidence](../../evidence/actions-documentation-execution.md)\n- [Original prior-art decisions](../../../02-design/actions-prior-art-decisions.md)'
};
const inputs:Record<string,string>={};
for(const file of files){
 let text=await readFile(join(source,file),'utf8');if(text.startsWith('---'))throw Error('Unsupported guide frontmatter '+file);
 for(const [name,block]of Object.entries(blocks)){
  const marker=`<!-- generated:${name}:start -->\n${block}\n<!-- generated:${name}:end -->`;
  text=text.replace(`{{snippet:${name}}}`,marker).replace(`{{${name}}}`,marker);
  const pattern=new RegExp(`<!-- generated:${name}:start -->[\\s\\S]*?<!-- generated:${name}:end -->`,'g');
  const old=text.match(pattern);if(old&&old.some(x=>x!==marker)){if(!refresh)throw Error('Stale source excerpt '+file+': '+name+'; run --refresh');text=text.replace(pattern,marker);}
 }
 if(text.includes('{{'))throw Error('Unresolved include '+file);
 if(refresh)await writeFile(join(source,file),text);
 inputs[join(source,file)]=hash(text);
 const lines=text.split('\n'),parts:string[]=[],anchors=new Set<string>();let paragraph:string[]=[],list=false;
 const flush=()=>{if(paragraph.length){parts.push('<p>'+inline(paragraph.join(' '),file)+'</p>');paragraph=[];}if(list){parts.push('</ul>');list=false;}};
 for(let i=0;i<lines.length;i++){
  const line=lines[i]!;
  if(line==='<!-- playground -->'){flush();if(file!=='getting-started.md')throw Error('Unexpected playground marker');parts.push('<section aria-label="Live portable inspection"><button id="inspect-action" type="button">Inspect the approval declaration</button><pre id="action-result" aria-live="polite">Ready. This example does not perform business writes.</pre></section>');continue;}
  if(line.startsWith('<!--'))continue;
  if(!line.trim()){flush();continue;}
  if(line==='{{playground}}')throw Error('Unprocessed playground');
  if(line.startsWith('```')){flush();const code:string[]=[];const lang=line.slice(3);while(++i<lines.length&&!lines[i]!.startsWith('```'))code.push(lines[i]!);if(i===lines.length)throw Error('Unclosed code fence');parts.push(`<pre><code data-language="${escape(lang)}">${escape(code.join('\n'))}</code></pre>`);continue;}
  const heading=line.match(/^(#{1,3}) (.+)$/);if(heading){flush();const id=heading[2]!.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(anchors.has(id))throw Error('Duplicate anchor '+file);anchors.add(id);parts.push(`<h${heading[1]!.length} id="${id}">${inline(heading[2]!,file)}</h${heading[1]!.length}>`);continue;}
  const img=line.match(/^!\[([^\]]+)\]\((diagrams\/[a-z-]+\.svg)\)$/);if(img){flush();const variations=[];for(const mobile of [false,true]){const imagePath=mobile?img[2]!.replace('.svg','-mobile.svg'):img[2]!;let svg=await readFile(join(source,imagePath),'utf8');if(/<script|<foreignObject|\son\w+=|href=|url\((?!#)/i.test(svg))throw Error('Unsafe SVG');const id=imagePath.split('/')[1]!.replace('.svg','');svg=svg.replace('<svg ',`<svg class="${mobile?'diagram-mobile':'diagram-desktop'}" `).replaceAll('id="title"',`id="${id}-title"`).replaceAll('id="desc"',`id="${id}-desc"`).replaceAll('title desc',`${id}-title ${id}-desc`).replaceAll('id="arrow"',`id="${id}-arrow"`).replaceAll('url(#arrow)',`url(#${id}-arrow)`);variations.push(svg);}parts.push('<figure aria-label="'+escape(img[1]!)+'">'+variations.join('')+'</figure>');continue;}
  if(line.startsWith('- ')){if(paragraph.length){parts.push('<p>'+inline(paragraph.join(' '),file)+'</p>');paragraph=[];}if(!list){parts.push('<ul>');list=true;}parts.push('<li>'+inline(line.slice(2),file)+'</li>');continue;}
  if(line.startsWith('<'))throw Error('Unsupported raw HTML '+file);
  paragraph.push(line);
 }
 flush();let body=parts.join('\n');
 rendered.set(file,body);
}
const style=`:root{color-scheme:light;--paper:#f4f1e9;--ink:#203c35}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.7 system-ui,sans-serif;overflow-wrap:anywhere}a{color:inherit;text-underline-offset:4px}a:hover{color:#365421}a:focus-visible,button:focus-visible{outline:3px solid #365421;outline-offset:4px}header{padding:20px max(5%,calc((100% - 1200px)/2));border-bottom:1px solid #afbeb1;display:flex;gap:24px;flex-wrap:wrap}header a{font-weight:650}.layout{display:grid;grid-template-columns:240px minmax(0,760px);gap:60px;max-width:1200px;padding:40px 5%;margin:auto}aside nav{display:flex;flex-direction:column;gap:12px}aside a[aria-current]{font-weight:750;border-left:3px solid #53732e;padding-left:10px}h1{font:normal 48px/1.1 Georgia,serif;letter-spacing:-1px;margin:0 0 28px}h2{font:normal 32px/1.2 Georgia,serif;margin:42px 0 18px}p{margin:18px 0}li{margin:10px 0}pre{background:#203c35;color:#f4f1e9;padding:22px;border-radius:8px;font:14px/1.65 ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere}code{font-family:ui-monospace,monospace}figure{margin:32px 0;max-width:720px}.diagram-mobile{display:none}figure svg{width:100%;height:auto}.diagram-desktop{display:block}button{background:#203c35;color:#f4f1e9;border:0;border-radius:6px;padding:14px 18px;font:600 16px system-ui;cursor:pointer}footer{max-width:1200px;margin:auto;padding:28px 5%;border-top:1px solid #afbeb1;font-size:14px}.skip{position:absolute;left:-10000px}.skip:focus{left:12px;top:10px;background:white;padding:8px}@media(max-width:800px){.layout{grid-template-columns:1fr;gap:30px;padding-top:25px}aside nav{display:flex;flex-direction:row;flex-wrap:wrap;gap:10px 18px;font-size:14px}h1{font-size:38px}header{gap:12px 18px}pre{padding:16px}figure{width:100%;max-width:360px}.diagram-desktop{display:none}.diagram-mobile{display:block}}`;
const browser=await Bun.build({entrypoints:['scripts/actions-docs/browser-example.ts'],target:'browser',format:'esm',minify:true,metafile:true});if(!browser.success)throw Error(String(browser.logs));
const rawMeta: unknown=browser.metafile;const meta=(typeof rawMeta==='string'?JSON.parse(rawMeta):rawMeta) as {inputs:Record<string,unknown>};for(const path of Object.keys(meta.inputs)){if(path.startsWith('node_modules/')||path.includes('/node_modules/'))continue;if(existsSync(path))inputs[path]=hash(await readFile(path));}
const bundle=await browser.outputs[0]!.text();const assets={'guide.css':style,'example.js':bundle};
const assetHashes=Object.fromEntries(Object.entries(assets).map(([p,v])=>[p,hash(v)]));
const outputs:Record<string,string>={...assets};
for(const [file,body]of rendered){
 const route=file.replace('.md','.html');const nav=files.map(f=>`<a href="${f.replace('.md','.html')}"${f===file?' aria-current="page"':''}>${escape(titles.get(f)!)}</a>`).join('\n');
 outputs[route]=`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(titles.get(file)!)} · UMF</title><meta name="description" content="Learn UMF actions through real examples, readable diagrams and scoped evidence."><link rel="stylesheet" href="guide.css"></head><body><a class="skip" href="#content">Skip to content</a><header><a href="../index.html">UMF</a><a href="../docs.html">Developers</a><a href="index.html">Actions</a><a href="../explorer.html">Schema explorer</a><a href="../demo.html">Playground</a></header><div class="layout"><aside aria-label="Action guide"><nav>${nav}</nav></aside><main id="content">${body}</main></div><footer>UMF · Action guide · <a href="https://github.com/DocumentDrivenDX/umf">Repository</a> · Experimental, versioned support</footer><script type="application/json" id="asset-integrity">${JSON.stringify(assetHashes)}</script>${file==='getting-started.md'?'<script type="module" src="example.js"></script>':''}</body></html>\n`;
}
for(const f of await readdir(join(source,'diagrams'))){const path=join(source,'diagrams',f);inputs[path]=hash(await readFile(path));}
for(const path of ['scripts/actions-docs/build.ts','scripts/actions-docs/browser-example.ts','scripts/actions-docs/portable-example.ts','scripts/actions-docs/render-diagrams.py','src/index.ts','fixtures/actions/approve.json','package.json','bun.lock','tsconfig.json','.github/workflows/microsite.yml'])inputs[path]=hash(await readFile(path));
for(const pattern of ['patches/**/*','src/**/*.ts','spec/**/*.json','scripts/actions-docs/*','fixtures/actions/*.json','docs/helix/02-design/contracts/*.md','docs/helix/04-build/evidence/actions-certification.md','docs/helix/04-build/evidence/actions-certification.json','docs/helix/04-build/evidence/actions-documentation-execution.md','docs/helix/04-build/evidence/actions-documentation-source-impact.json'])for await(const path of new Bun.Glob(pattern).scan('.'))inputs[path]=hash(await readFile(path));
const manifest=JSON.stringify({profile:'umf.actions.documentation-build/1',ownership:'Only microsite/dist/actions; diagrams are inline inside signed HTML',inputs:Object.fromEntries(Object.entries(inputs).sort(([a],[b])=>a<b?-1:a>b?1:0)),outputs:Object.fromEntries(Object.entries(outputs).map(([p,v])=>[p,hash(v)])),assetHashes},null,2)+'\n';outputs['manifest.json']=manifest;
if(check){const actual=(await readdir(output)).sort();if(JSON.stringify(actual)!==JSON.stringify(Object.keys(outputs).sort()))throw Error('Generated output ownership differs');for(const[p,v]of Object.entries(outputs))if(await readFile(join(output,p),'utf8')!==v)throw Error('Stale generated output '+p);console.log('Deterministic guide output, snippets and asset manifest match');}
else{await mkdir(output,{recursive:true});for(const f of await readdir(output))if(!Object.hasOwn(outputs,f))await rm(join(output,f),{recursive:false});for(const[p,v]of Object.entries(outputs))await writeFile(join(output,p),v);console.log('Built '+files.length+' action guide pages; SVG bytes inline, asset hashes bound in each page');}

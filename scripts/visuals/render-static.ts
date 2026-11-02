// SPDX-License-Identifier: MIT OR Apache-2.0
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium} from 'playwright';
import type {renderLiniPresentation} from '@documentdrivendx/umf-visual/renderers/lini';
import {visualRuntimeAsset,visualPackageIdentity} from '../visual-runtime-assets';
import {actionVisual,fabricVisual,visualDocument,type Figure} from './definitions';

const check=process.argv.includes('--check');
const actions=process.argv.includes('--actions');
const directory=resolve('docs/helix/04-build/guides/actions/diagrams');
const rendererPackage=await visualPackageIdentity();
const bundle=await Bun.build({entrypoints:[join(import.meta.dir,'browser-entry.ts')],target:'browser',format:'esm'});
if(!bundle.success)throw Error(bundle.logs.join('\n'));
const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/')return new Response('<!doctype html><meta charset="utf-8"><script type="module" src="/renderer.js"></script>',{headers:{'Content-Type':'text/html'}});
 if(path==='/renderer.js')return new Response(bundle.outputs[0],{headers:{'Content-Type':'text/javascript'}});
 if(path.startsWith('/runtime/')){const name=path.slice('/runtime/'.length);if(['lini_wasm.js','lini_wasm_bg.wasm','runtime-manifest.json','LICENSE'].includes(name))return new Response(Bun.file(visualRuntimeAsset(name as Parameters<typeof visualRuntimeAsset>[0])));}
 return new Response('Not found',{status:404});
}});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.port}`);await page.waitForFunction(()=>typeof (globalThis as any).renderVisual==='function');
const runtimeBaseUrl=`http://127.0.0.1:${server.port}/runtime/`;
const hash=(text:string)=>new Bun.CryptoHasher('sha256').update(text).digest('hex');
async function emit(path:string,text:string){
 if(check){if(!await Bun.file(path).exists()||await Bun.file(path).text()!==text)throw Error('Stale diagram '+path);}
 else await writeFile(path,text);
}
async function render(visual:Parameters<typeof visualDocument>[0],path:string,originalSource?:Figure){
 const document=visualDocument(visual),result=await page.evaluate(async({document,runtimeBaseUrl})=>{
  return await ((globalThis as any).renderVisual as typeof renderLiniPresentation)(document,{runtimeBaseUrl});
 },{document,runtimeBaseUrl});
 if(!result.ok)throw Error(JSON.stringify(result.diagnostics));
 // Native source and its full loss report stay with the exact drawing source.
 const escape=(text:string)=>text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const title=visual.title??visual.question;
 const description=originalSource?originalSource.panels.map(panel=>panel.title+': '+panel.text).join(' '):fabricVisual.takeaway;
 const svg=result.svg.replace(/<svg\b[^>]*>/,root=>root+`<title id="title">${escape(title)}</title><desc id="desc">${escape(description)}</desc>`).replace('<svg ','<svg role="img" aria-labelledby="title desc" ').trimEnd()+'\n';
 const companion={profile:'umf.site.lini-presentation/1',rendererPackage,document,...(originalSource?{originalSource}:{}),nativeVersion:result.nativeVersion,
  elementMap:result.elementMap,omissions:result.omissions,approximations:result.approximations,
  nativeSource:result.source,svgSha256:hash(svg)};
 await emit(path,svg);await emit(path.replace(/\.svg$/,'.visual.json'),JSON.stringify(companion,null,2)+'\n');
}
try{if(actions){
 const figures=JSON.parse(await readFile(join(directory,'source.json'),'utf8')) as Figure[];
 for(const figure of figures)for(const mobile of [false,true])await render(actionVisual(figure,mobile),join(directory,figure.id+(mobile?'-mobile':'')+'.svg'),figure);
 console.log(`${check?'Checked':'Rendered'} ${figures.length} action diagrams in desktop/mobile Lini layouts`);
}else{
 const destination=resolve('docs/helix/05-deploy/microsite/dist/visuals');if(!check)await mkdir(destination,{recursive:true});
 await render(fabricVisual,join(destination,'fabric.svg'));
 const htmlPath=resolve('docs/helix/05-deploy/microsite/dist/index.html');
 const html=await readFile(htmlPath,'utf8');
 const drawing='<div class="fabric" data-renderer="umf.visual/lini"><img src="visuals/fabric.svg" alt="Native schemas and authored models carry common metadata and native details through UMF to generators, forms and AI context" style="width:100%;height:auto;max-height:640px;object-fit:contain"><p class="fabric-caption">Tools read the metadata they need. Support varies by format and operation.</p><a href="visuals/fabric.visual.json" download>Diagram source and rendering limits</a></div>';
 const region=/<div class="fabric"(?: data-renderer="umf.visual\/lini")?>[\s\S]*?<\/div><\/section>/;
 if(!region.test(html))throw Error('Home illustration host was not found');
 const next=html.replace(region,drawing+'</section>');
 await emit(htmlPath,next);
 console.log('Rendered source-bound home-page illustration with Lini');
}}finally{await browser.close();server.stop(true);}

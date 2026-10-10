import {shell} from './shell';
import type {SchemaBrowserOptions,SchemaBrowserHandle} from './types';
export type {SchemaBrowserOptions,SchemaBrowserHandle,Entry,SourceArtifact} from './types';

function escapeAttribute(value:string){return value.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');}
/** Build an isolated document. JSON remains inert even if source text contains HTML. */
export function browserDocument(options:SchemaBrowserOptions,baseUrl:string):string {
 const assets=new URL(options.assetsUrl,baseUrl);if(!/^https?:$/.test(assets.protocol))throw Error('assetsUrl must use HTTP(S).');
 if(!assets.pathname.endsWith('/'))assets.pathname+='/';
 if(!options.entries&&!options.catalogUrl)throw Error('Supply entries or catalogUrl.');
 const config={...(options.entries?{entries:options.entries}:{}),...(options.catalogUrl?{catalogUrl:new URL(options.catalogUrl,baseUrl).href}:{}),assetBaseUrl:new URL(options.assetBaseUrl??'.',baseUrl).href,...(options.initialRoute?{initialRoute:options.initialRoute}:{})};
 const json=JSON.stringify(config).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return `<!doctype html><html lang="en"><head><base href="about:srcdoc"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Schema browser</title><link rel="stylesheet" href="${escapeAttribute(new URL('style.css',assets).href)}"><link rel="stylesheet" href="${escapeAttribute(new URL('explorer.css',assets).href)}"></head><body>${shell}<script id="umf-browser-config" type="application/json">${json}</script><script type="module" src="${escapeAttribute(new URL('explorer.js',assets).href)}"></script></body></html>`;
}

/** Framework-neutral browser mount; styles, routing and state stay inside the frame. */
export function mountSchemaBrowser(container:HTMLElement,options:SchemaBrowserOptions):SchemaBrowserHandle {
 const doc=container.ownerDocument,iframe=doc.createElement('iframe');
 iframe.title=options.title??'UMF schema browser';iframe.style.cssText='display:block;width:100%;border:0;';iframe.style.height=options.height??'800px';
 const html=browserDocument(options,doc.baseURI);
 let rejectReady:(reason:Error)=>void=()=>{},settled=false;
 const ready=new Promise<void>((resolve,reject)=>{rejectReady=reject;iframe.addEventListener('load',()=>{settled=true;resolve();},{once:true});});
 iframe.srcdoc=html;container.append(iframe);
 return {iframe,ready,destroy(){if(!settled){settled=true;rejectReady(Error('Schema browser destroyed before load.'));}iframe.remove();}};
}

import {shell} from './shell';
import type {SchemaBrowserOptions,SchemaBrowserHandle,Selection} from './types';
export type * from './types';
export {renderPropertyTable,renderRecordMap,compareDocuments,renderDocumentDiff,comparisonModel} from './components';
const escapeAttribute=(v:string)=>v.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
export function browserDocument(options:SchemaBrowserOptions,baseUrl:string,instance='standalone'):string {
 const assets=new URL(options.assetsUrl,baseUrl);if(!/^https?:$/.test(assets.protocol))throw Error('assetsUrl must use HTTP(S).');if(!assets.pathname.endsWith('/'))assets.pathname+='/';
 if(!options.entries&&!options.catalog&&!options.catalogUrl)throw Error('Supply entries or catalogUrl.');
 const config={instance,parentOrigin:new URL(baseUrl).origin,...(options.catalog?{catalog:options.catalog}:{}),...(options.entries?{entries:options.entries}:{}),...(options.catalogUrl?{catalogUrl:new URL(options.catalogUrl,baseUrl).href}:{}),assetBaseUrl:new URL(options.assetBaseUrl??'.',baseUrl).href,initialRoute:options.initialRoute,selection:options.selection,categories:options.categories,annotations:options.annotations,readOnlyLocalFiles:options.readOnlyLocalFiles,theme:options.theme??'auto',themeVariables:options.themeVariables,hideHero:options.hideHero};
 if(new TextEncoder().encode(JSON.stringify(config)).length>8_000_000)throw Error('Catalog configuration exceeds 8 MB');
 const json=JSON.stringify(config).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Schema browser</title><link rel="stylesheet" href="${escapeAttribute(new URL('style.css',assets).href)}"><link rel="stylesheet" href="${escapeAttribute(new URL('explorer.css',assets).href)}"></head><body>${shell}<script id="umf-browser-config" type="application/json">${json}</script><script type="module" src="${escapeAttribute(new URL('explorer.js',assets).href)}"></script></body></html>`;
}
export function mountSchemaBrowser(container:HTMLElement,options:SchemaBrowserOptions):SchemaBrowserHandle {
 const doc=container.ownerDocument,win=doc.defaultView!;const iframe=doc.createElement('iframe'),instance=(crypto.randomUUID?.()??Math.random().toString(36).slice(2));iframe.title=options.title??'UMF schema browser';iframe.className='umf-schema-browser-frame';iframe.width='100%';iframe.height=options.height??'800';iframe.setAttribute('frameborder','0');if(options.height&&!/^\d+$/.test(options.height))iframe.style.height=options.height;
 const pending=new Map<string,{resolve:(s:Selection)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 let resolveReady:()=>void=()=>{},rejectReady:(e:Error)=>void=()=>{},settled=false,destroyed=false,terminalError:Error|undefined;const queue:unknown[]=[];
 const ready=new Promise<void>((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const send=(type:string,payload:unknown)=>{if(destroyed)throw Error('Schema browser destroyed');if(terminalError)throw terminalError;const requestId=(crypto.randomUUID?.()??Math.random().toString(36).slice(2));const message={protocol:1,instance,type,payload,requestId};if(!settled)queue.push(message);else iframe.contentWindow?.postMessage(message,win.location.origin);return requestId;};
 let readyTimer:ReturnType<typeof setTimeout>;
 const receive=(event:MessageEvent)=>{if(destroyed||event.source!==iframe.contentWindow||event.origin!==win.location.origin)return;const m=event.data;if(!m||m.protocol!==1||m.instance!==instance||typeof m.type!=='string')return;
  if(m.type==='umf-explorer:ready'){if(settled)return;settled=true;clearTimeout(readyTimer);resolveReady();for(const message of queue)iframe.contentWindow?.postMessage(message,win.location.origin);queue.length=0;options.onReady?.();}
  if(m.type==='umf-explorer:height'&&Number.isFinite(m.payload?.height))options.onContentHeight?.(m.payload.height);
  if(m.type==='umf-explorer:select'){const request=pending.get(m.requestId);if(request){request.resolve(m.payload);clearTimeout(request.timer);pending.delete(m.requestId);}options.onSelect?.(m.payload);}
  if(m.type==='umf-explorer:navigate')options.onNavigate?.(m.payload);
  if(m.type==='umf-explorer:error'){const request=pending.get(m.requestId);if(request){request.reject(Error(m.payload.message));clearTimeout(request.timer);pending.delete(m.requestId);}options.onError?.(m.payload);if(m.payload?.code==='CATALOG'){options.onCatalogError?.(m.payload);if(!settled){settled=true;clearTimeout(readyTimer);terminalError=Error(m.payload.message);rejectReady(terminalError);queue.length=0;for(const request of pending.values()){clearTimeout(request.timer);request.reject(terminalError);}pending.clear();}}}
 };
 const html=browserDocument(options,doc.baseURI,instance);win.addEventListener('message',receive);readyTimer=setTimeout(()=>{if(settled||destroyed)return;settled=true;terminalError=Error('Schema browser initialization timed out');rejectReady(terminalError);for(const request of pending.values()){clearTimeout(request.timer);request.reject(terminalError);}pending.clear();queue.length=0;options.onError?.({code:'INITIALIZATION_TIMEOUT',message:terminalError.message});},30000);iframe.srcdoc=html;container.append(iframe);
 return {iframe,ready,focus(){iframe.focus();send('umf-explorer:focus',{});},select(selection:Selection){const id=send('umf-explorer:select',selection);return new Promise<Selection>((resolve,reject)=>pending.set(id,{resolve,reject,timer:setTimeout(()=>{pending.delete(id);reject(Error('Selection timed out'));},30000)}));},setAnnotations(value){send('umf-explorer:annotations',value);},destroy(){if(destroyed)return;destroyed=true;clearTimeout(readyTimer);win.removeEventListener('message',receive);queue.length=0;for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Schema browser destroyed'));}pending.clear();if(!settled){settled=true;rejectReady(Error('Schema browser destroyed before ready.'));}iframe.remove();}};
}
export const mount=mountSchemaBrowser;

export type {ComponentModel,ChangeStatus,DocumentChange} from './components';

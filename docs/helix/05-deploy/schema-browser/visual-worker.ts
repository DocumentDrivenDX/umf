// SPDX-License-Identifier: MIT OR Apache-2.0
/** The trusted renderer runs off the UI thread. Only data crosses this boundary;
 * its fixed-schema validation and native runtime do not execute in the page. */
import {renderLiniPresentation} from '@documentdrivendx/umf-visual/renderers/lini';
const worker=globalThis as unknown as {onmessage:(event:MessageEvent)=>void;postMessage:(value:unknown)=>void};
worker.onmessage=async event=>{
 const {id,document,runtimeBaseUrl}=event.data;
 if(!Number.isSafeInteger(id)||typeof runtimeBaseUrl!=='string')return;
 try{worker.postMessage({id,result:await renderLiniPresentation(document,{runtimeBaseUrl})});}
 catch(error){worker.postMessage({id,error:error instanceof Error?error.message:String(error)});}
};

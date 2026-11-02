// SPDX-License-Identifier: MIT OR Apache-2.0
type Renderer=typeof import('@documentdrivendx/umf-visual/renderers/lini').renderLiniPresentation;
type Result=Awaited<ReturnType<Renderer>>;
let worker:Worker|undefined,nextId=0;
const pending=new Map<number,{resolve:(result:Result)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
export function renderVisual(document:Parameters<Renderer>[0],runtimeBaseUrl=new URL('./lini/',import.meta.url).href):Promise<Result>{
 if(!worker){
  worker=new Worker(new URL('./visual-worker.js',import.meta.url),{type:'module',name:'umf.visual Lini'});
  worker.onmessage=event=>{const request=pending.get(event.data?.id);if(!request)return;pending.delete(event.data.id);clearTimeout(request.timer);if(event.data.error)request.reject(Error(event.data.error));else request.resolve(event.data.result);};
  worker.onerror=()=>{for(const request of pending.values()){clearTimeout(request.timer);request.reject(Error('Lini rendering worker failed'));}pending.clear();worker?.terminate();worker=undefined;};
 }
 const target=worker,id=++nextId;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('Lini rendering timed out'));},60000);
  pending.set(id,{resolve,reject,timer});
  try{target.postMessage({id,document,runtimeBaseUrl});}
  catch(error){clearTimeout(timer);pending.delete(id);reject(error);}
 });
}

import {loadCurrent,hash,type Row} from './state';
export interface PublicationSelection {id:string;revision?:string}
/** Verified source bytes for trusted consumer projections; never parses source bodies. */
export async function readLoaderPublication(state:string,selection:PublicationSelection[]){
 if(!Array.isArray(selection)||selection.length>1000||selection.some(s=>!s||typeof s.id!=='string'||!s.id||Object.keys(s).some(k=>!['id','revision'].includes(k))||(s.revision!==undefined&&!/^[a-f0-9]{64}$/.test(s.revision)))||new Set(selection.map(s=>JSON.stringify([s.id,s.revision??null]))).size!==selection.length)throw Error('PUBLICATION_SELECTION');
 const loaded=await loadCurrent(state);if(!loaded)throw Error('NO_REPLAY_SNAPSHOT');
 const rows:Row[]=[],keys=new Set<string>();
 for(const request of selection){
  const candidates=request.revision===undefined?loaded.snapshot.rows.filter(r=>r.id===request.id):loaded.snapshot.history.filter(r=>r.id===request.id&&r.revision===request.revision);
  if(!candidates.length)throw Error('UNRESOLVED_PUBLICATION_SELECTION');
  for(const row of candidates){const key=JSON.stringify(row);if(!keys.has(key)){keys.add(key);rows.push(row);}}
 }
 if(rows.reduce((n,row)=>n+row.bytes,0)>500*1024*1024)throw Error('PUBLICATION_COPY_LIMIT');
 return {version:'1.0.0',scope:'selected-originals-only',publication:{manifest_hash:loaded.manifestHash,pack_hash:loaded.snapshot.binding.pack_hash,inventory_hash:loaded.snapshot.inventory_hash,projection_version:loaded.snapshot.projection_version,rights:loaded.snapshot.binding.rights},sources:rows.map(row=>({row:structuredClone(row),bytes:new Uint8Array(loaded.objects.get(row.sha256)!)}))};
}

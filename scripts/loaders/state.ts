import {readFile,mkdir,writeFile,rename,realpath} from 'node:fs/promises';
import {resolve,join,relative,isAbsolute} from 'node:path';
import type {Rights,Profile} from './inventory';
import {readBounded} from './bytes';
export const hash=(value:string|Uint8Array)=>new Bun.CryptoHasher('sha256').update(value).digest('hex');
export const json=(value:unknown)=>JSON.stringify(value,null,2)+'\n';
export interface Row {id:string;url:string;sha256:string;media_type:string;bytes:number;revision:string;metadata:Record<string,unknown>;license:Record<string,unknown>}
export interface Observation {run_id:string;id:string;sha256:string;url:string;inventory_hash:string;retrieved_at:string;metadata:Record<string,unknown>;license:Record<string,unknown>}
export interface Binding {pack_hash:string;pack_id:string;pack_version:string;profile:Profile;rights:Rights;inventory_id:string;implementation_version:'1.0.0'}
export interface Snapshot {version:'1.0.0';binding:Binding;inventory_hash:string;receipt_hash:string;projection_hash:string;projection_version:'1.0.0';inventory_history:Record<string,string>;history:Row[];rows:Row[];observations:Observation[]}
export interface Loaded {snapshot:Snapshot;inventoryText:string;directory:string;manifestHash:string;objects:Map<string,Uint8Array>}
export async function readContained(root:string,path:string,limit=100*1024*1024):Promise<Uint8Array> {
 const source=resolve(root,path),actual=await realpath(source),base=await realpath(root),inside=relative(base,actual);
 if(isAbsolute(path)||inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error('STATE_PATH');
 return readBounded(actual,limit);
}
export const projection=(rows:Row[])=>rows.map(r=>JSON.stringify(r)+'\n').join('');
export async function loadCurrent(root:string):Promise<Loaded|undefined>{
 let pointerText:string;try{pointerText=new TextDecoder().decode(await readBounded(join(root,'current.json'),1024*1024));}catch(e:any){if(e.code==='ENOENT')return;throw e;}
 const pointer=JSON.parse(pointerText);
 if(pointer.version!=='1.0.0'||typeof pointer.manifest!=='string'||!/^publications\/[a-f0-9-]{36}\/manifest.json$/.test(pointer.manifest)||!/^[a-f0-9]{64}$/.test(pointer.sha256))throw Error('STATE_POINTER');
 const raw=await readContained(root,pointer.manifest);if(hash(raw)!==pointer.sha256)throw Error('MANIFEST_HASH');
 const snapshot=JSON.parse(new TextDecoder().decode(raw)) as Snapshot;
 if(snapshot.version!=='1.0.0'||snapshot.projection_version!=='1.0.0'||!Array.isArray(snapshot.history)||!Array.isArray(snapshot.rows)||!Array.isArray(snapshot.observations))throw Error('STATE_MANIFEST');
 const directory=resolve(root,pointer.manifest,'..');
 const inventoryBytes=await readContained(directory,'inventory.json',4*1024*1024);if(hash(inventoryBytes)!==snapshot.inventory_hash)throw Error('INVENTORY_HASH');
 const receipt=await readContained(directory,'receipt.json',10*1024*1024);if(hash(receipt)!==snapshot.receipt_hash)throw Error('RECEIPT_HASH');
 const projected=await readContained(directory,'documents.jsonl');if(hash(projected)!==snapshot.projection_hash||new TextDecoder().decode(projected)!==projection(snapshot.rows))throw Error('PROJECTION_HASH');
 if(snapshot.history.length>10000||snapshot.observations.length>100000)throw Error('STATE_LIMIT');
 const objects=new Map<string,number>(),verified=new Map<string,Uint8Array>();
 if(!snapshot.inventory_history||typeof snapshot.inventory_history!=='object'||Object.keys(snapshot.inventory_history).length>10000)throw Error('INVENTORY_HISTORY');
 for(const [digest,text] of Object.entries(snapshot.inventory_history))if(typeof text!=='string'||hash(text)!==digest)throw Error('INVENTORY_HISTORY');
 for(const row of snapshot.history){
  if(!/^[a-f0-9]{64}$/.test(row.sha256)||row.revision!==row.sha256||!Number.isSafeInteger(row.bytes)||row.bytes<0||row.bytes>50*1024*1024)throw Error('STATE_ROW');
  if(objects.has(row.sha256)&&objects.get(row.sha256)!==row.bytes)throw Error('STATE_ROW');
  objects.set(row.sha256,row.bytes);
 }
 if([...objects.values()].reduce((a,b)=>a+b,0)>500*1024*1024)throw Error('STATE_LIMIT');
 for(const [id,size] of objects){const bytes=await readContained(directory,'objects/'+id,size);if(bytes.length!==size||hash(bytes)!==id)throw Error('OBJECT_HASH');verified.set(id,bytes);}
 if(snapshot.rows.some(r=>!snapshot.history.some(h=>JSON.stringify(h)===JSON.stringify(r))))throw Error('STATE_HISTORY');
 for(const o of snapshot.observations)if(!objects.has(o.sha256)||!Object.hasOwn(snapshot.inventory_history,o.inventory_hash))throw Error('OBSERVATION_HISTORY');
 return {objects:verified,snapshot,inventoryText:new TextDecoder().decode(inventoryBytes),directory,manifestHash:pointer.sha256};
}
export async function atomicJson(root:string,name:string,value:unknown){const temp=join(root,'.'+crypto.randomUUID()+'.tmp');await writeFile(temp,json(value),{flag:'wx'});await rename(temp,join(root,name));}
export async function preparePublication(root:string,id:string,snapshot:Snapshot,inventoryText:string,objects:Map<string,Uint8Array>,receipt:unknown){
 const directory=join(root,'publications',id);await mkdir(join(directory,'objects'),{recursive:true});
 for(const [digest,bytes] of objects)await writeFile(join(directory,'objects',digest),bytes,{flag:'wx'});
 await writeFile(join(directory,'inventory.json'),inventoryText,{flag:'wx'});
 await writeFile(join(directory,'documents.jsonl'),projection(snapshot.rows),{flag:'wx'});
 await writeFile(join(directory,'receipt.json'),json(receipt),{flag:'wx'});
 const manifestText=json(snapshot);if(new TextEncoder().encode(manifestText).byteLength>100*1024*1024)throw Error('STATE_METADATA_LIMIT');await writeFile(join(directory,'manifest.json'),manifestText,{flag:'wx'});
 return {version:'1.0.0',manifest:'publications/'+id+'/manifest.json',sha256:hash(manifestText)};
}

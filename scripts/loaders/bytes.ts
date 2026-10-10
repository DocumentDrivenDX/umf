import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
export interface ByteBudget {used:number;limit:number}
/** Bound allocation before and during reads; no special files or final symlink. */
export async function readBounded(path:string,limit:number,budget?:ByteBudget):Promise<Uint8Array>{
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const stat=await file.stat();if(!stat.isFile()||stat.size>limit||(budget&&stat.size>budget.limit-budget.used))throw Error('FILE_BYTE_LIMIT');
  const chunks:Uint8Array[]=[],buffer=new Uint8Array(Math.min(limit+1,64*1024));let total=0;
  for(;;){const {bytesRead}=await file.read(buffer,0,buffer.length,null);if(!bytesRead)break;total+=bytesRead;if(budget)budget.used+=bytesRead;if(total>limit||(budget&&budget.used>budget.limit))throw Error('FILE_BYTE_LIMIT');chunks.push(buffer.slice(0,bytesRead));}
  const out=new Uint8Array(total);let offset=0;for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;}return out;
 }finally{await file.close();}
}

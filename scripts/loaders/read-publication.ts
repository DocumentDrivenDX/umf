import {resolve,join,dirname} from 'node:path';
import {mkdir,lstat,rename,rm} from 'node:fs/promises';
import {readLoaderPublication,type PublicationSelection} from './publication';
import {readBounded} from './bytes';
import {json,hash} from './state';
import {readJsonValue} from '../../src/model/serialization';
export async function main(args:string[]):Promise<number>{
 const allowed=['--state','--selection','--output'],flags=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){const k=args[i]!,v=args[i+1];if(!allowed.includes(k)||!v||v.startsWith('--')||flags.has(k)){console.error('Usage: bun read-publication.ts --state DIRECTORY --selection FILE --output NEW_DIRECTORY');return 2;}flags.set(k,v);}
 if(allowed.some(k=>!flags.has(k)))return 2;
 let stage:string|undefined;
 try{
  const selection=readJsonValue(new TextDecoder().decode(await readBounded(resolve(flags.get('--selection')!),1024*1024)),'json') as unknown as PublicationSelection[];
  const result=await readLoaderPublication(resolve(flags.get('--state')!),selection),output=resolve(flags.get('--output')!);
  try{await lstat(output);throw Error('OUTPUT_EXISTS');}catch(e:any){if(e.code!=='ENOENT')throw e;}
  await mkdir(dirname(output),{recursive:true});stage=join(dirname(output),'.umf-selection-'+crypto.randomUUID());await mkdir(join(stage,'objects'),{recursive:true});
  const objects=new Set<string>();for(const source of result.sources){if(objects.has(source.row.sha256))continue;objects.add(source.row.sha256);await Bun.write(join(stage,'objects',source.row.sha256),source.bytes);}
  await Bun.write(join(stage,'selection.json'),json({version:result.version,scope:result.scope,publication:result.publication,selection,sources:result.sources.map(s=>({...s.row,reference:'objects/'+s.row.sha256}))}));
  await rename(stage,output);stage=undefined;console.log(JSON.stringify({status:'complete',scope:result.scope,sources:result.sources.length,manifest_hash:result.publication.manifest_hash,rights:result.publication.rights}));return 0;
 }catch(e:any){console.error(JSON.stringify({status:'refused',code:/^[A-Z][A-Z0-9_]+$/.test(e.message)?e.message:'PUBLICATION_IO'}));return 1;}
 finally{if(stage)await rm(stage,{recursive:true,force:true});}
}
if(import.meta.main)process.exitCode=await main(process.argv.slice(2));

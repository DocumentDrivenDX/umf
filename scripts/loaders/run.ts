import {readFile,realpath} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {inspectDomainPackLoader} from '../../src/domain-packs/loader';
import {readJsonValue} from '../../src/model/serialization';
import {runLoader} from './engine';
import {hash} from './state';
import {readBounded} from './bytes';
const usage='Usage: bun run.ts --pack PACK --state DIRECTORY --mode backfill|refresh|replay --rights local-use|redistribute [--inventory INVENTORY (required for acquisition)]';
export async function main(args:string[]):Promise<number>{
 const allowed=['--pack','--state','--mode','--rights','--inventory'];const flags=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){const key=args[i]!,value=args[i+1];if(!allowed.includes(key)||!value||value.startsWith('--')||flags.has(key)){console.error(usage);return 2;}flags.set(key,value);}
 if(['--pack','--state','--mode','--rights'].some(k=>!flags.has(k))||!['backfill','refresh','replay'].includes(flags.get('--mode')!)||!['local-use','redistribute'].includes(flags.get('--rights')!)||(flags.get('--mode')!=='replay'&&!flags.has('--inventory'))){console.error(usage);return 2;}
 try{
  const path=resolve(flags.get('--pack')!),text=new TextDecoder().decode(await readBounded(await realpath(path),4*1024*1024)),pack=readJsonValue(text,'json') as any;
  if(typeof pack.id!=='string'||typeof pack.version!=='string'||!inspectDomainPackLoader(pack.loader).valid)throw Error('LOADER_METADATA');
  const base=await realpath(dirname(path));
  for(const artifact of pack.loader.artifacts){
   const actual=await realpath(resolve(base,artifact.reference)),inside=relative(base,actual);
   if(isAbsolute(artifact.reference)||inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error('COMPANION_PATH');
   if(hash(await readBounded(actual,10*1024*1024))!==artifact.sha256)throw Error('COMPANION_HASH');
  }
  const self=hash(await readBounded(import.meta.path,10*1024*1024));
  if(self!==pack.loader.artifacts.find((a:any)=>a.reference===pack.loader.entrypoint)?.sha256)throw Error('RUNNER_IDENTITY');
  const result=await runLoader({state:resolve(flags.get('--state')!),pack,packHash:hash(text),mode:flags.get('--mode')! as 'backfill'|'refresh'|'replay',rights:flags.get('--rights')! as 'local-use'|'redistribute',...(flags.has('--inventory')?{inventoryText:new TextDecoder().decode(await readBounded(await realpath(resolve(flags.get('--inventory')!)),4*1024*1024))}:{}),...(process.env.UMF_LOADER_USER_AGENT?{userAgent:process.env.UMF_LOADER_USER_AGENT}:{})});
  console.log(JSON.stringify(result));return result.status==='complete'?0:1;
 }catch(error:any){console.error(JSON.stringify({status:'refused',code:/^[A-Z][A-Z0-9_]+$/.test(error.message)?error.message:'CONFIGURATION_IO'}));return 1;}
}
if(import.meta.main)process.exitCode=await main(process.argv.slice(2));

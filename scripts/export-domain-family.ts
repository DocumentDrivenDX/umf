import {mkdtemp,mkdir,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {resolveDomainFamily} from './domain-pack-family';
const args=process.argv.slice(2),input=args[args.indexOf('--pack')+1],output=args[args.indexOf('--output')+1];
if(!args.includes('--pack')||!args.includes('--output')||!input||!output)throw Error('Usage: --pack <pack.json> --output <directory> [--include-sources] [--check]');
const members=await resolveDomainFamily(input),temporary=await mkdtemp(join(tmpdir(),'umf-family-')),destination=resolve(output),check=args.includes('--check');
async function exportPack(path:string,target:string,verify=false){
 const child=Bun.spawn(['bun',resolve(import.meta.dir,'export-domain-pack.ts'),'--pack',path,'--output',target,...(args.includes('--include-sources')?['--include-sources']:[]),...(verify?['--check']:[])],{stdout:'pipe',stderr:'pipe'});
 const [code,stderr]=await Promise.all([child.exited,new Response(child.stderr).text(),new Response(child.stdout).text()]);
 if(code)throw Error(stderr);
}
try{
 // Validate every source/schema before changing the selected destination.
 for(const member of members)await exportPack(member.path,join(temporary,member.pack.id+'@'+member.pack.version));
 const inventory=JSON.stringify({version:'1.0.0',id:members[0]!.pack.id,packs:members.map(m=>({id:m.pack.id,version:m.pack.version,reference:m.pack.id+'@'+m.pack.version+'/domain-pack.json',checksum:{algorithm:'sha256',value:new Bun.CryptoHasher('sha256').update(m.text).digest('hex')}}))},null,2)+'\n';
 if(check){
  if(await Bun.file(join(destination,'family.json')).text()!==inventory)throw Error('Stale family inventory');
  for(const member of members)await exportPack(member.path,join(destination,member.pack.id+'@'+member.pack.version),true);
 }else{
  await mkdir(destination,{recursive:true});
  for(const member of members)await cp(join(temporary,member.pack.id+'@'+member.pack.version),join(destination,member.pack.id+'@'+member.pack.version),{recursive:true});
  await Bun.write(join(destination,'family.json'),inventory);
 }
 console.log(JSON.stringify({family:members[0]!.pack.id,packs:members.length,checked:check}));
}finally{await rm(temporary,{recursive:true,force:true});}

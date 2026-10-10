import {mkdtemp,cp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const temp=await mkdtemp(join(tmpdir(),'umf-loader-catalog-'));
try{
 const normal=join(temp,'normal'),medical=join(temp,'medical');await cp('spec/domain-packs/court-documents-loader-demo',normal,{recursive:true});await cp(normal,medical,{recursive:true});
 const base=await Bun.file(join(normal,'pack.json')).json();base.id='generic-loader-integration';delete base.sources.inventory;base.sources.ref={kind:'external',data_kind:'observed',reference:'urn:local-only',format:'pdf',license:{redistribution:'unknown'}};await Bun.write(join(normal,'pack.json'),JSON.stringify(base));
 const med={...base,id:'medical-loader-integration',family:{id:'medical',version:'1.0.0',label:'Test medical family'}};await Bun.write(join(medical,'pack.json'),JSON.stringify(med));
 const child=Bun.spawn([process.execPath,'docs/helix/05-deploy/microsite/build-explorer.ts',temp],{stdout:'pipe',stderr:'pipe'});const [code,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);if(code)throw Error(stderr);
 const catalog=await Bun.file('docs/helix/05-deploy/microsite/dist/schema-catalog.json').json();for(const id of [base.id,med.id]){const p=catalog.entries.find((e:any)=>e.id==='pack:'+id+'@1.0.0');if(!p||p.assets.length!==5||p.assets.some((a:any)=>a.reference.endsWith('.zip')||a.reference==='inventory.json'))throw Error('Unexpected catalog assets '+id);}
 console.log(JSON.stringify({checks:2,scope:'Generic loader and medical+loader catalog builds; no invented inventory or ZIP assets',stdout:stdout.trim()}));
}finally{
 await rm(temp,{recursive:true,force:true});
 const restore=Bun.spawn([process.execPath,'docs/helix/05-deploy/microsite/build-explorer.ts'],{stdout:'pipe',stderr:'pipe'});const [code,stdout,stderr]=await Promise.all([restore.exited,new Response(restore.stdout).text(),new Response(restore.stderr).text()]);if(code)throw Error(stderr);
}

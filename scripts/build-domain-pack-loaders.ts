import {resolve,join} from 'node:path';
import {readFile,mkdir,rm,mkdtemp,cp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {generateDomainPackLoaderSchema} from '../src/domain-packs/loader';
import {generateLoaderInventorySchema} from '../src/domain-packs/loader-inventory';
import {hash,json} from './loaders/state';
const repo=resolve(import.meta.dir,'..'),canonical=join(repo,'spec/loader-companion/1.0.0'),check=process.argv.includes('--check');
if(Bun.version!=='1.3.14')throw Error('Build companions with pinned Bun 1.3.14');
const result=await Bun.build({entrypoints:[join(repo,'scripts/loaders/run.ts'),join(repo,'scripts/loaders/read-publication.ts')],target:'bun',minify:false,external:[],naming:'[name].ts'});
if(!result.success)throw Error(result.logs.join('\n'));
const guide=await readFile(join(repo,'docs/helix/05-deploy/domain-pack-loaders.md'),'utf8');
const files=new Map<string,string>([...await Promise.all(result.outputs.map(async output=>[output.path.split('/').pop()!,await output.text()] as [string,string])),['inventory.schema.json',json((({$id,...schema})=>schema)(generateLoaderInventorySchema()))],['loader.schema.json',json((({$id,...schema})=>schema)(generateDomainPackLoaderSchema()))],['README.md',guide]]);
const artifacts=[...files].map(([reference,text])=>({reference,sha256:hash(text)}));
async function write(path:string,text:string){if(check){if(await Bun.file(path).text()!==text)throw Error('Stale loader artifact: '+path);}else await Bun.write(path,text);}
for(const [name,text] of files)await write(join(canonical,name),text);
await write(join(canonical,'release.json'),json({id:'umf.document-loader',version:'1.0.0',compiler:'Bun 1.3.14',artifacts}));
for(const profile of ['court-documents','sec-filings'] as const){
 const id=profile+'-loader-demo',directory=join(repo,'spec/domain-packs',id);
 const inventory={version:'1.0.0',id:profile+'-selection',allowed_hosts:profile==='court-documents'?['www.ca2.uscourts.gov']:['www.sec.gov','data.sec.gov'],request_interval_ms:1000,max_bytes:10*1024*1024,max_total_bytes:100*1024*1024,max_documents:100,timeout_ms:30000,retries:2,entries:[]};
 const inventoryText=json(inventory);
 const pack={id,version:'1.0.0',description:'Reusable '+profile+' loader companion; empty operator-selected inventory. No observed corpus or complete discovery claim.',domain_types:{source_document:{description:'Original source bytes with revision-qualified metadata'}},sources:{inventory:{kind:'external',data_kind:'fabricated',reference:'inventory.json',format:'json',checksum:{algorithm:'sha256',value:hash(inventoryText)},license:{redistribution:'allowed',id:'MIT'},provenance:{publisher:'UMF maintainers',transformations:['Empty authored configuration example, not source observations']}}},source_bindings:[],schemas:[],loader:{version:'1.0.0',id:'umf.document-loader',implementation_version:'1.0.0',profile,runtime:'bun',entrypoint:'run.ts',configuration_schema:'inventory.schema.json',qualification:'Finite explicit inventory, metadata projection and immutable local publication; no discovery, parsing or native sink claim.',artifacts}};
 await write(join(directory,'pack.json'),json(pack));await write(join(directory,'inventory.json'),inventoryText);
 for(const [name,text] of files)await write(join(directory,name),text);
}
// Optional site assets use the trusted exporter and contain only authored demo configs.
if(process.argv.includes('--site')){
 const {exportPack}=await import('./loaders/export');const dist=join(repo,'docs/helix/05-deploy/microsite/dist/loaders');await mkdir(dist,{recursive:true});
 const temp=await mkdtemp(join(tmpdir(),'umf-loader-bundle-'));
 try{
  for(const profile of ['court-documents','sec-filings']){
   const id=profile+'-loader-demo',out=join(temp,id);await exportPack(join(repo,'spec/domain-packs',id,'pack.json'),out,{includeSources:true});
   const zip=Bun.spawn(['zip','-qr',join(temp,id+'.zip'),id],{cwd:temp,stdout:'pipe',stderr:'pipe'});if(await zip.exited)throw Error(await new Response(zip.stderr).text());
   await cp(join(temp,id+'.zip'),join(dist,id+'.zip'));
  }
  await Bun.write(join(dist,'README.md'),guide);await Bun.write(join(dist,'release.json'),json({id:'umf.document-loader',version:'1.0.0',artifacts,bundles:await Promise.all(['court-documents','sec-filings'].map(async p=>({reference:p+'-loader-demo.zip',sha256:hash(new Uint8Array(await readFile(join(dist,p+'-loader-demo.zip'))))})))}));
 }finally{await rm(temp,{recursive:true,force:true});}
}
console.log(json({id:'umf.document-loader',version:'1.0.0',artifacts:artifacts.length,check}));

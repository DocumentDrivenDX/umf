import {resolve,join} from 'node:path';
import {readFile,mkdir,rm,cp} from 'node:fs/promises';
import {generateDomainPackLoaderSchema} from '../src/domain-packs/loader';
import {generateLoaderInventorySchema} from '../src/domain-packs/loader-inventory';
import {hash,json} from './loaders/state';
const repo=resolve(import.meta.dir,'..'),canonical=join(repo,'spec/loader-companion/1.0.0'),check=process.argv.includes('--check');
if(Bun.version!=='1.3.14')throw Error('Build companions with pinned Bun 1.3.14');
// Published 1.0.0 is immutable. Verify its canonical bytes rather than rebuilding
// historical runtime code against newer portable metadata validators.
const guide=await readFile(join(canonical,'README.md'),'utf8');
const release=await Bun.file(join(canonical,'release.json')).json();
const files=new Map<string,string>();
for(const item of release.artifacts){const text=await readFile(join(canonical,item.reference),'utf8');if(hash(text)!==item.sha256)throw Error('Canonical release checksum differs');files.set(item.reference,text);}
if(files.size!==5||files.get('inventory.schema.json')!==json((({$id,...schema})=>schema)(generateLoaderInventorySchema()))||files.get('loader.schema.json')!==json((({$id,...schema})=>schema)(generateDomainPackLoaderSchema())))throw Error('Canonical schema closure differs');
const artifacts=[...files].map(([reference,text])=>({reference,sha256:hash(text)}));
async function write(path:string,text:string){if(check){if(await Bun.file(path).text()!==text)throw Error('Stale loader artifact: '+path);}else await Bun.write(path,text);}
for(const [name,text] of files)await write(join(canonical,name),text);
await write(join(canonical,'release.json'),json({id:'umf.document-loader',version:'1.0.0',compiler:'Bun 1.3.14',artifacts}));
for(const profile of ['court-documents','sec-filings'] as const){
 const id=profile+'-loader-demo',directory=join(repo,'spec/domain-packs',id);
 const inventory={version:'1.0.0',id:profile+'-selection',allowed_hosts:profile==='court-documents'?['www.ca2.uscourts.gov']:['www.sec.gov','data.sec.gov'],request_interval_ms:1000,max_bytes:10*1024*1024,max_total_bytes:100*1024*1024,max_documents:100,timeout_ms:30000,retries:2,entries:[]};
 const inventoryText=json(inventory);
 const preservation={version:'1.0.0',handoff:'BagIt-1.0',fixity:'sha256',events:'PREMIS-3.0-semantic-mapping',provenance:'PROV-O-JSON-LD',originals:'authoritative-immutable-bytes',primary_runtime:'tablespec-python',qualification:'TableSpec native Python acquisition and offline BagIt transfer. PREMIS semantic JSON mapping and PROV-O source revision graph; no PREMIS XML, OCFL archive or WARC capture claim. Domain projections remain separately qualified.'};
 const pack={id,version:'1.0.1',description:'Reusable '+profile+' loader companion; empty operator-selected inventory. No observed corpus or complete discovery claim.',domain_types:{source_document:{description:'Original source bytes with revision-qualified metadata'}},sources:{inventory:{kind:'external',data_kind:'fabricated',reference:'inventory.json',format:'json',checksum:{algorithm:'sha256',value:hash(inventoryText)},license:{redistribution:'allowed',id:'MIT'},provenance:{publisher:'UMF maintainers',transformations:['Empty authored configuration example, not source observations']}}},source_bindings:[],schemas:[],loader:{version:'1.0.0',id:'umf.document-loader',implementation_version:'1.0.0',profile,runtime:'bun',entrypoint:'run.ts',configuration_schema:'inventory.schema.json',qualification:'Finite explicit inventory, metadata projection and immutable local publication; no discovery, parsing or native sink claim.',artifacts},preservation};
 await write(join(directory,'pack.json'),json(pack));await write(join(directory,'inventory.json'),inventoryText);
 for(const [name,text] of files)await write(join(directory,name),text);
}
// Publish individual authored configurations and canonical tools, never generated archives.
if(process.argv.includes('--site')){
 const {exportPack}=await import('./loaders/export');const dist=join(repo,'docs/helix/05-deploy/microsite/dist/loaders');
 await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
 for(const profile of ['court-documents','sec-filings']){
  const id=profile+'-loader-demo',out=join(dist,id);
  await exportPack(join(repo,'spec/domain-packs',id,'pack.json'),out,{includeSources:true});
  await cp(join(repo,'spec/domain-packs',id,'GUIDE.md'),join(out,'GUIDE.md'));
 }
 await Bun.write(join(dist,'README.md'),await readFile(join(repo,'docs/helix/05-deploy/document-preservation.md'),'utf8'));
 await Bun.write(join(dist,'release.json'),json({id:'umf.document-loader',version:'1.0.0',artifacts,distribution:'Individual tools/configuration; archives are consumer-built'}));
}
console.log(json({id:'umf.document-loader',version:'1.0.0',artifacts:artifacts.length,check}));

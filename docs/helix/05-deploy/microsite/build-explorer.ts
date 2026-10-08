import {resolve,relative,join,dirname,isAbsolute} from 'node:path';
import {readdir} from 'node:fs/promises';
import {parseEntry,type Entry} from './explorer-model';
const repo=resolve(import.meta.dir,'../../../..'),dist=join(import.meta.dir,'dist');
const supplied=process.argv.slice(2),roots=supplied.length?supplied.map(p=>resolve(p)):[...['domain-packs','packs','spec/domain-packs','examples/domain-packs'].map(p=>join(repo,p)),join(import.meta.dir,'catalog-sources')];
async function files(root:string):Promise<string[]>{try{const items=await readdir(root,{withFileTypes:true});return (await Promise.all(items.filter(i=>!i.name.startsWith('.')&&i.name!=='node_modules').map(i=>i.isDirectory()?files(join(root,i.name)):Promise.resolve(/\.(json|ya?ml)$/i.test(i.name)?[join(root,i.name)]:[])))).flat().sort();}catch(error:any){if(error.code==='ENOENT'&&!supplied.length)return [];throw error;}}
const entries:Entry[]=[],seen=new Set<string>();
for(const root of roots){const paths=await files(root);
 const manifestPaths:string[]=[];for(const candidate of paths.filter(p=>p.endsWith('.json'))){const data=JSON.parse(await Bun.file(candidate).text());if(data&&typeof data.id==='string'&&data.generator&&data.domain_types)manifestPaths.push(candidate);}
 for(const path of manifestPaths){
  const text=await Bun.file(path).text(),pack=JSON.parse(text);parseEntry({id:path,title:pack.id,category:'domain',path,text,format:'json'});
  if(typeof pack.version!=='string'||!pack.generator||!pack.domain_types)throw new Error(`Incomplete pack manifest: ${path}`);
  const identity=`${pack.id}@${pack.version}`;if(seen.has(identity)){if(root===join(import.meta.dir,'catalog-sources'))continue;throw new Error(`Duplicate pack identity: ${identity}`);}seen.add(identity);
  entries.push({id:`pack:${identity}`,title:pack.id,category:'domain',path:'domain-pack.json',pack:pack.id,packVersion:pack.version,text,format:'json',description:pack.description});
  const schemaIds=new Set<string>();for(const declaration of pack.schemas??[]){if(schemaIds.has(declaration.id))throw new Error(`Duplicate schema ID in ${identity}: ${declaration.id}`);schemaIds.add(declaration.id);
   if(typeof declaration.reference!=='string'||isAbsolute(declaration.reference))throw new Error(`Invalid local reference: ${declaration.reference}`);
   const source=resolve(dirname(path),declaration.reference),rel=relative(dirname(path),source);if(rel.startsWith('..')||isAbsolute(rel))throw new Error(`Pack reference escapes its directory: ${declaration.reference}`);
   const format=/\.ya?ml$/i.test(source)?'yaml':'json',entry:Entry={id:`schema:${identity}:${declaration.id}`,title:declaration.id,category:'domain',path:declaration.reference,pack:pack.id,packVersion:pack.version,schemaFormat:declaration.format,text:await Bun.file(source).text(),format};
   const parsed=parseEntry(entry);if(parsed.document)entry.title=String(parsed.document.title??parsed.document.id);entries.push(entry);
  }
 }
 for(const path of paths.filter(p=>!manifestPaths.includes(p))){const text=await Bun.file(path).text(),format=/\.ya?ml$/i.test(path)?'yaml':'json';if(format==='json'){const value=JSON.parse(text);if(!value||typeof value.umf!=='string'||!Array.isArray(value.modules))continue;}else if(!/^umf\s*:/m.test(text))continue;
  const source=relative(repo,path);if(seen.has(source))continue;seen.add(source);const entry:Entry={id:source,title:source,category:'domain',path:source,text,format};const parsed=parseEntry(entry);entry.title=String(parsed.document!.title??parsed.document!.id);entries.push(entry);
 }
}
const path='fixtures/core/schema-properties.json',text=await Bun.file(join(repo,path)).text();entries.push({id:path,title:'Orders · core schema properties',category:'example',path,text,format:'json'});
await Bun.write(join(dist,'schema-catalog.json'),JSON.stringify({version:1,entries},null,2)+'\n');
const build=await Bun.build({entrypoints:[join(import.meta.dir,'explorer.ts')],outdir:dist,target:'browser',minify:true});if(!build.success)throw new Error(build.logs.join('\n'));
console.log(`Explorer built: ${entries.filter(e=>e.id.startsWith('pack:')).length} packs, ${entries.length} catalog entries.`);

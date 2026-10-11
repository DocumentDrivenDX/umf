import {join} from 'node:path';
import {cp,mkdir} from 'node:fs/promises';
const fallback=['explorer.js','explorer.css'];
async function shared(packageRoot:string){const file=Bun.file(join(packageRoot,'asset-manifest.json'));return await file.exists()?Object.keys((await file.json()).assets).filter(name=>!['index.html','schema-catalog.json'].includes(name)):fallback;}
export async function verifySiteAssets(packageRoot:string,site:string,expectedVersion:string){
 const metadata=await Bun.file(join(packageRoot,'package.json')).json();
 if(metadata.name!=='@documentdrivendx/umf-schema-browser'||metadata.version!==expectedVersion)throw Error('Installed schema browser differs from the exact release pin.');
 const release=Bun.file(join(packageRoot,'release-manifest.json'));const [major,minor]=metadata.version.split('.').map(Number);if((major>1||major===1&&minor>=1)&&!await release.exists())throw Error('Released package lacks its complete fixity manifest');if(await release.exists())for(const [name,hash] of Object.entries((await release.json()).sha256)){if(name.startsWith('/')||name.split('/').includes('..'))throw Error('Invalid package manifest path');if(new Bun.CryptoHasher('sha256').update(await Bun.file(join(packageRoot,name)).bytes()).digest('hex')!==hash)throw Error('Package manifest fixity failed: '+name);}
 const hashes:Record<string,string>={};
 for(const name of await shared(packageRoot)){const original=await Bun.file(join(packageRoot,'assets',name)).bytes(),served=await Bun.file(join(site,name==='style.css'?'browser-style.css':name)).bytes();
  if(!Buffer.from(original).equals(Buffer.from(served)))throw Error(`Schema browser asset drift: ${name}`);
  hashes[name]=new Bun.CryptoHasher('sha256').update(original).digest('hex');
 }
 const main=(text:string)=>text.match(/<main\b[\s\S]*?<\/main>/)?.[0];
 const packageMain=main(await Bun.file(join(packageRoot,'assets/index.html')).text()),siteMain=main(await Bun.file(join(site,'explorer.html')).text());
 if(!packageMain||packageMain!==siteMain)throw Error('Schema browser workspace markup differs from the released package.');
 return {package:metadata.name,version:metadata.version,assets:hashes,workspaceSha256:new Bun.CryptoHasher('sha256').update(packageMain).digest('hex')};
}
export async function installSiteAssets(packageRoot:string,site:string,expectedVersion:string){
 const metadata=await Bun.file(join(packageRoot,'package.json')).json();if(metadata.version!==expectedVersion||metadata.name!=='@documentdrivendx/umf-schema-browser')throw Error('Installed schema browser differs from the exact release pin.');
 await mkdir(site,{recursive:true});await cp(packageRoot,join(site,'schema-browser'),{recursive:true});
 for(const name of await shared(packageRoot))await cp(join(packageRoot,'assets',name),join(site,name==='style.css'?'browser-style.css':name));
 const explorer=join(site,'explorer.html');const html=await Bun.file(explorer).text();if(!html.includes('href="browser-style.css"'))await Bun.write(explorer,html.replace('<link rel="stylesheet" href="explorer.css">','<link rel="stylesheet" href="browser-style.css"><link rel="stylesheet" href="explorer.css">'));
 const manifest=await verifySiteAssets(packageRoot,site,expectedVersion);
 await Bun.write(join(site,'schema-browser-release.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}

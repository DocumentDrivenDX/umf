import {join} from 'node:path';
import {cp,mkdir,rm} from 'node:fs/promises';
import {verifyPackage as verifyCompletePackage} from '../../../../scripts/schema-browser-integrity';

async function verifyPackage(packageRoot:string,expectedVersion:string){
 const metadata=await Bun.file(join(packageRoot,'package.json')).json();
 if(metadata.name!=='@documentdrivendx/umf-schema-browser'||metadata.version!==expectedVersion)throw Error('Installed schema browser differs from the exact release pin.');
 await verifyCompletePackage(packageRoot);const manifest=await Bun.file(join(packageRoot,'release-manifest.json')).json();
 return {metadata,manifest};
}

export async function verifySiteAssets(packageRoot:string,site:string,expectedVersion:string){
 const {metadata,manifest}=await verifyPackage(packageRoot,expectedVersion),installed=join(site,'schema-browser');
 await verifyCompletePackage(installed);
 for(const [name,hash] of Object.entries(manifest.sha256??{})){
  const file=join(installed,name);if(!await Bun.file(file).exists())throw Error('Installed browser package file is missing: '+name);
  if(new Bun.CryptoHasher('sha256').update(await Bun.file(file).bytes()).digest('hex')!==hash)throw Error('Installed browser package drift: '+name);
 }
 const page=await Bun.file(join(site,'reference/core.html')).text();
 if(!page.includes('core.html#view=catalog')||!page.includes('id="model-catalog"'))throw Error('Canonical core reference lacks its model catalog view.');
 for(const route of ['explorer.html','schema-browser.html'])if(await Bun.file(join(site,route)).exists())throw Error('Separate browser host remains installed: '+route);
 for(const name of ['catalog-defaults.js','schema-navigation.js','explorer.js','explorer.css','browser-style.css','components.css'])if(await Bun.file(join(site,name)).exists())throw Error('Legacy browser renderer asset remains installed: '+name);
 for await(const name of new Bun.Glob('chunk*.js').scan({cwd:site,onlyFiles:true}))throw Error('Legacy browser renderer chunk remains installed: '+name);
 return {package:metadata.name,version:metadata.version,assets:manifest.sha256,workspaceSha256:manifest.sha256['assets/index.html']};
}

export async function installSiteAssets(packageRoot:string,site:string,expectedVersion:string){
 await verifyPackage(packageRoot,expectedVersion);
 const installed=join(site,'schema-browser');await rm(installed,{recursive:true,force:true});await mkdir(site,{recursive:true});
 await cp(packageRoot,installed,{recursive:true});
 await verifyCompletePackage(installed);
 const {metadata,manifest}=await verifyPackage(packageRoot,expectedVersion);
 for(const [name,hash] of Object.entries(manifest.sha256??{}))if(new Bun.CryptoHasher('sha256').update(await Bun.file(join(installed,name)).bytes()).digest('hex')!==hash)throw Error('Installed browser package drift: '+name);
 const receipt={package:metadata.name,version:metadata.version,assets:manifest.sha256};
 await Bun.write(join(site,'schema-browser-release.json'),JSON.stringify(receipt,null,2)+'\n');return receipt;
}

/** Remove assets owned by the former root-hosted renderer; preserve site and action runtime files. */
export async function removeLegacyRendererAssets(site:string){
 for(const name of ['explorer.html','schema-browser.html','catalog-defaults.js','schema-navigation.js','explorer.js','explorer.css','browser-style.css','components.css'])await rm(join(site,name),{force:true});
 for await(const name of new Bun.Glob('chunk*.js').scan({cwd:site,onlyFiles:true}))await rm(join(site,name),{force:true});
}

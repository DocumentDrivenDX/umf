import {resolve,join} from 'node:path';
import {installSiteAssets,removeLegacyRendererAssets} from './site-assets';
const repo=resolve(import.meta.dir,'../../../..'),site=resolve(import.meta.dir,'../microsite/dist'),output=resolve(process.argv[2]??join(repo,'node_modules/@documentdrivendx/umf-schema-browser'));
const args=process.argv.slice(2);let pkg=output,pin:string,preview=false;
if(args[0]==='--candidate'){
 if(args.length!==2)throw Error('Use --candidate <built-package-directory>.');
 pkg=resolve(args[1]!);const metadata=await Bun.file(join(pkg,'package.json')).json();pin=metadata.version;
 if(metadata.name!=='@documentdrivendx/umf-schema-browser'||pin!=='2.0.0')throw Error('Local preview requires the exact 2.0.0 source candidate.');preview=true;
}else{
 if(args.length>1)throw Error('Pass either --candidate <directory> or one installed package directory.');
 const consumer=(await Bun.file(join(repo,'package.json')).json()).devDependencies['@documentdrivendx/umf-schema-browser'];
 if(!/^\d+\.\d+\.\d+$/.test(consumer))throw Error('Schema browser must have an exact release pin.');
 pkg=args[0]?resolve(args[0]):output;pin=consumer;
}
const receipt=await installSiteAssets(pkg,site,pin);
await removeLegacyRendererAssets(site);
if(preview)await Bun.write(join(site,'schema-browser-release.json'),JSON.stringify({profile:'umf.schema-browser.local-preview/1',published:false,...receipt},null,2)+'\n');
console.log(preview?'Installed the local 2.0.0 candidate; not published and not the consumer pin.':'Copied the exact reusable browser package under /schema-browser; the only site host is reference/core.html.');

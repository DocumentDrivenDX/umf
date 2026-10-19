import {resolve,join} from 'node:path';
import {rm} from 'node:fs/promises';
import {installSiteAssets} from './site-assets';

const candidate=resolve(process.argv[2]??'');
if(!process.argv[2])throw Error('Pass a concrete built candidate package directory.');
const site=resolve(import.meta.dir,'../microsite/dist'),metadata=await Bun.file(join(candidate,'package.json')).json();
if(metadata.name!=='@documentdrivendx/umf-schema-browser'||metadata.version!=='2.0.0')throw Error('Preview requires the exact 2.0.0 source candidate.');
const receipt=await installSiteAssets(candidate,site,'2.0.0');
for(const route of ['explorer.html','schema-browser.html'])await rm(join(site,route),{force:true});
await Bun.write(join(site,'schema-browser-release.json'),JSON.stringify({profile:'umf.schema-browser.local-preview/1',published:false,...receipt},null,2)+'\n');
console.log(`Installed local schema-browser 2.0.0 candidate into ${site}; this preview does not establish publication or the package pin.`);

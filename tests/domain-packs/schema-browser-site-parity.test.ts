import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {installSiteAssets,verifySiteAssets,removeLegacyRendererAssets} from '../../docs/helix/05-deploy/schema-browser/site-assets';

const digest=(value:string|Uint8Array)=>new Bun.CryptoHasher('sha256').update(value).digest('hex');
async function packageFixture(root:string){
 const pkg=join(root,'package');await mkdir(join(pkg,'assets'),{recursive:true});await mkdir(join(pkg,'types'),{recursive:true});
 const assets={'index.html':'<main>Package workspace</main>','explorer.js':'renderer'};
 const ordinary:Record<string,string>={
  'index.js':'export const version = "1.0.1";','types/index.d.ts':'export declare const version: string;','README.md':'Package','HOST_CONTRACT.md':'Host contract','catalog.schema.json':'{}',
  'package.json':JSON.stringify({name:'@documentdrivendx/umf-schema-browser',version:'1.0.1',exports:{'.':'./index.js','./types':'./types/index.d.ts','./assets/*':'./assets/*'}}),
 };
 for(const[name,body]of Object.entries(assets))await Bun.write(join(pkg,'assets',name),body);
 const assetHashes=Object.fromEntries(Object.entries(assets).map(([name,body])=>[name,digest(body)]));
 ordinary['asset-manifest.json']=JSON.stringify({version:1,assets:assetHashes});
 ordinary['provenance.json']=JSON.stringify({version:1,packageVersion:'1.0.1',revision:'a'.repeat(40),bun:'1.4.2',lockfileSha256:digest('lock'),inputs:{'src/index.ts':digest('source')},assets:assetHashes});
 for(const[name,body]of Object.entries(ordinary))await Bun.write(join(pkg,name),body);
 const payload={...Object.fromEntries(Object.entries(ordinary).map(([name,body])=>[name,digest(body)])),...Object.fromEntries(Object.entries(assets).map(([name,body])=>['assets/'+name,digest(body)]))};
 await Bun.write(join(pkg,'release-manifest.json'),JSON.stringify({version:1,sha256:payload}));
 await Bun.write(join(pkg,'SHA256SUMS'),Object.entries(payload).sort().map(([name,hash])=>hash+'  '+name).join('\n')+'\n');
 return pkg;
}

test('site verifies the complete package and removes the old root renderer while keeping current host assets',async()=>{
 const root=await mkdtemp(join(tmpdir(),'umf-parity-')),pkg=await packageFixture(root),site=join(root,'site');
 await mkdir(join(site,'reference'),{recursive:true});await Bun.write(join(site,'reference/core.html'),'<a href="core.html#view=catalog">Catalog</a><section id="model-catalog"></section>');
 for(const name of ['explorer.html','schema-browser.html','catalog-defaults.js','schema-navigation.js','explorer.js','explorer.css','browser-style.css','components.css','chunk-old.js'])await Bun.write(join(site,name),'old renderer');
 for(const name of ['style.css','schema-catalog.json','truss-catalog-worker.js'])await Bun.write(join(site,name),'current site asset');
 const receipt=await installSiteAssets(pkg,site,'1.0.1');expect(receipt.version).toBe('1.0.1');expect(await Bun.file(join(site,'schema-browser/assets/explorer.js')).text()).toBe('renderer');
 await removeLegacyRendererAssets(site);await expect(verifySiteAssets(pkg,site,'1.0.1')).resolves.toMatchObject({version:'1.0.1'});
 for(const name of ['explorer.html','schema-browser.html','catalog-defaults.js','schema-navigation.js','explorer.js','explorer.css','browser-style.css','components.css','chunk-old.js'])expect(await Bun.file(join(site,name)).exists()).toBe(false);
 for(const name of ['style.css','schema-catalog.json','truss-catalog-worker.js'])expect(await Bun.file(join(site,name)).exists()).toBe(true);
 await expect(verifySiteAssets(pkg,site,'1.0.2')).rejects.toThrow('exact release pin');
 await Bun.write(join(site,'explorer.html'),'<main>old host</main>');await expect(verifySiteAssets(pkg,site,'1.0.1')).rejects.toThrow('Separate browser host remains installed');await rm(join(site,'explorer.html'));
 await Bun.write(join(site,'schema-browser.html'),'<main>old host</main>');await expect(verifySiteAssets(pkg,site,'1.0.1')).rejects.toThrow('Separate browser host remains installed');await rm(join(site,'schema-browser.html'));
 await Bun.write(join(site,'chunk-old.js'),'old renderer');await expect(verifySiteAssets(pkg,site,'1.0.1')).rejects.toThrow('Legacy browser renderer chunk');await rm(join(site,'chunk-old.js'));
 await Bun.write(join(site,'schema-browser/assets/explorer.js'),'independent build');await expect(verifySiteAssets(pkg,site,'1.0.1')).rejects.toThrow();
 await rm(root,{recursive:true,force:true});
});

test('site rejects empty package inventories and altered package bytes',async()=>{
 const root=await mkdtemp(join(tmpdir(),'umf-integrity-')),pkg=await packageFixture(root),site=join(root,'site');
 await mkdir(join(site,'reference'),{recursive:true});await Bun.write(join(site,'reference/core.html'),'<a href="core.html#view=catalog">Catalog</a><section id="model-catalog"></section>');
 const release=join(pkg,'release-manifest.json'),original=await Bun.file(release).json();
 await Bun.write(release,JSON.stringify({version:1,sha256:{}}));await expect(installSiteAssets(pkg,site,'1.0.1')).rejects.toThrow('Invalid release inventory');
 const incomplete={...original,sha256:{...original.sha256}};delete incomplete.sha256['assets/explorer.js'];await Bun.write(release,JSON.stringify(incomplete));await expect(installSiteAssets(pkg,site,'1.0.1')).rejects.toThrow('Complete package inventory differs');
 await Bun.write(release,JSON.stringify(original));await Bun.write(join(pkg,'assets/explorer.js'),'tampered');await expect(installSiteAssets(pkg,site,'1.0.1')).rejects.toThrow();
 await rm(root,{recursive:true,force:true});
});

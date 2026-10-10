import {test,expect} from 'bun:test';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {installSiteAssets,verifySiteAssets} from '../../docs/helix/05-deploy/schema-browser/site-assets';
test('released assets stay identical and refuse asset, version and workspace drift',async()=>{
 const root=await mkdtemp(join(tmpdir(),'umf-parity-')),pkg=join(root,'package'),site=join(root,'site');
 await Bun.write(join(pkg,'package.json'),JSON.stringify({name:'@documentdrivendx/umf-schema-browser',version:'1.0.1'}));
 for(const name of ['explorer.js','explorer.css'])await Bun.write(join(pkg,'assets',name),'released '+name);
 await Bun.write(join(pkg,'assets/index.html'),'<main>Shared workspace</main>');await Bun.write(join(site,'explorer.html'),'<header>Site branding</header><main>Shared workspace</main>');
 const manifest=await installSiteAssets(pkg,site,'1.0.1');expect(manifest.version).toBe('1.0.1');expect(await Bun.file(join(site,'explorer.js')).text()).toBe('released explorer.js');
 await expect(verifySiteAssets(pkg,site,'1.0.2')).rejects.toThrow('release pin');
 await Bun.write(join(site,'explorer.js'),'independent build');await expect(verifySiteAssets(pkg,site,'1.0.1')).rejects.toThrow('asset drift');
 await installSiteAssets(pkg,site,'1.0.1');await Bun.write(join(site,'explorer.html'),'<main>Drifted workspace</main>');await expect(verifySiteAssets(pkg,site,'1.0.1')).rejects.toThrow('workspace markup');
});

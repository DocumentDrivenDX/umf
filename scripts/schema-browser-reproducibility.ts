/** Two clean producer builds must produce identical complete payloads. */
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const root=await mkdtemp(join(tmpdir(),'umf-browser-repro-'));
try{
 for(const name of ['first','second']){const build=Bun.spawn([process.execPath,'docs/helix/05-deploy/schema-browser/build.ts',join(root,name)],{stdout:'inherit',stderr:'inherit'});if(await build.exited)throw Error('Producer build failed');}
 const a=await Bun.file(join(root,'first/release-manifest.json')).json(),b=await Bun.file(join(root,'second/release-manifest.json')).json();if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Clean producer payloads differ: '+Object.keys(a.sha256).filter(key=>a.sha256[key]!==b.sha256[key]).join(', '));
 const installed='node_modules/@documentdrivendx/umf-schema-browser';if(await Bun.file(join(installed,'asset-manifest.json')).exists()){const produced=await Bun.file(join(root,'first/asset-manifest.json')).json(),released=await Bun.file(join(installed,'asset-manifest.json')).json();if(JSON.stringify(produced)!==JSON.stringify(released))throw Error('Producer runtime assets differ from exact installed release');for(const name of ['index.js',...Object.keys(a.sha256).filter(name=>name.startsWith('types/'))])if(new Bun.CryptoHasher('sha256').update(await Bun.file(join(installed,name)).bytes()).digest('hex')!==a.sha256[name])throw Error('Producer exported API differs from exact installed release: '+name);}
 console.log('Two clean schema-browser builds have identical complete SHA-256 manifests.');
}finally{await rm(root,{recursive:true,force:true});}

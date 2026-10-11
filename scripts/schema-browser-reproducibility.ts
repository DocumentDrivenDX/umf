/** Two clean producer builds must produce identical complete payloads. */
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
const root=await mkdtemp(join(tmpdir(),'umf-browser-repro-'));
try{
 for(const name of ['first','second']){const build=Bun.spawn([process.execPath,'docs/helix/05-deploy/schema-browser/build.ts',join(root,name)],{stdout:'inherit',stderr:'inherit'});if(await build.exited)throw Error('Producer build failed');}
 const a=await Bun.file(join(root,'first/release-manifest.json')).json(),b=await Bun.file(join(root,'second/release-manifest.json')).json();if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Clean producer payloads differ: '+Object.keys(a.sha256).filter(key=>a.sha256[key]!==b.sha256[key]).join(', '));
 const installed='node_modules/@documentdrivendx/umf-schema-browser';
 if(await Bun.file(join(installed,'asset-manifest.json')).exists()){
  const provenance=await Bun.file(join(installed,'provenance.json')).json();
  // 1.1.0 was produced with Bun 1.3.14 on macOS arm64. Bun chunk hashes
  // are not qualified as cross-platform reproducible. Site parity instead
  // compares every served byte directly with the installed npm package.
  for(const [name,hash] of Object.entries(provenance.inputs)){
   const runtime=name.startsWith('src/')||name.startsWith('docs/helix/05-deploy/microsite/')&&name.endsWith('.ts')||name.startsWith('docs/helix/05-deploy/schema-browser/')&&(/\.(css|json)$/.test(name)||name.endsWith('.ts')&&!['build.ts','example-host.ts','notices.ts'].some(file=>name.endsWith('/'+file)));
   if(runtime&&new Bun.CryptoHasher('sha256').update(await Bun.file(name).bytes()).digest('hex')!==hash)throw Error('Runtime source differs from installed release provenance: '+name);
  }
  if(process.platform==='darwin'&&process.arch==='arm64'&&Bun.version===provenance.bun){
   const produced=await Bun.file(join(root,'first/asset-manifest.json')).json(),released=await Bun.file(join(installed,'asset-manifest.json')).json();if(JSON.stringify(produced)!==JSON.stringify(released))throw Error('Producer runtime assets differ from exact installed release');
   for(const name of ['index.js',...Object.keys(a.sha256).filter(name=>name.startsWith('types/'))])if(new Bun.CryptoHasher('sha256').update(await Bun.file(join(installed,name)).bytes()).digest('hex')!==a.sha256[name])throw Error('Producer exported API differs from exact installed release: '+name);
  }else console.log('Release runtime source provenance verified; cross-platform bundle identity is unqualified. Served npm asset identity is enforced by site-assets.ts.');
 }

 console.log('Two clean schema-browser builds have identical complete SHA-256 manifests.');
}finally{await rm(root,{recursive:true,force:true});}

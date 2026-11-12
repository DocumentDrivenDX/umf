// SPDX-License-Identifier: MIT OR Apache-2.0
// Builds the microsite from source into docs/helix/05-deploy/microsite/dist (never committed) and stamps it
// with the release version.
//
//   bun scripts/site/build.ts [--only step,step] [--skip step,step]
//
// Requires: bun deps installed, Rust 1.90 with the wasm32-unknown-unknown target, wasm-bindgen-cli 0.2.100,
// Go (protobuf compiler build), Playwright Chromium (visuals), Python 3.
import {cp,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dir,'../..');
const dist=join(root,'docs/helix/05-deploy/microsite/dist');
const arg=(name:string)=>{const i=Bun.argv.indexOf(name);return i<0?undefined:Bun.argv[i+1]!.split(',');};
const only=arg('--only'),skip=arg('--skip')??[];

async function run(command:string[],env:Record<string,string>={}){
 console.log('+ '+command.join(' '));
 const child=Bun.spawn(command,{cwd:root,env:{...process.env,...env},stdout:'inherit',stderr:'inherit'});
 const code=await child.exited;
 if(code!==0)throw Error(`${command.join(' ')} exited ${code}`);
}
async function capture(command:string[]){
 const child=Bun.spawn(command,{cwd:root,stdout:'pipe',stderr:'ignore'});
 const text=await new Response(child.stdout).text();
 return await child.exited===0?text.trim():'';
}

const wasmTarget=join(root,'target');
const steps:[string,()=>Promise<void>][]=[
 ['static',async()=>{await mkdir(dist,{recursive:true});await cp(join(root,'site'),dist,{recursive:true});}],
 ['visuals',()=>run(['bun','scripts/visuals/render-static.ts'])],
 ['demo',()=>run(['bun','build','docs/helix/05-deploy/microsite/demo.ts','--target','browser','--minify','--outfile',join(dist,'demo.js')])],
 ['explorer',()=>run(['bun','docs/helix/05-deploy/microsite/build-explorer.ts'])],
 ['schema-browser',()=>run(['bun','docs/helix/05-deploy/schema-browser/publish-site.ts'])],
 ['reference',()=>run(['bun','run','build:reference'])],
 ['actions-guide',()=>run(['bun','run','build:docs'])],
 ['pack-tools',async()=>{
  const out=join(root,'.cache/site-pack-tools-wasm');
  await run(['cargo','build','--release','--locked','--manifest-path','bindings/pack-tools/wasm/Cargo.toml','--target','wasm32-unknown-unknown'],{CARGO_TARGET_DIR:wasmTarget});
  await run(['wasm-bindgen','--target','web','--out-dir',out,'--out-name','umf_core_wasm',join(wasmTarget,'wasm32-unknown-unknown/release/umf_pack_tools_wasm.wasm')]);
  await run(['bun','docs/helix/05-deploy/microsite/build-pack-tools.ts','--wasm-dir',out]);
 }],
 ['loaders',()=>run(['bun','scripts/build-domain-pack-loaders.ts','--site'])],
 ['stamp',stamp],
];

// Version stamp: the manifest version, the exact tag when HEAD is a release, and the latest released tag.
async function stamp(){
 const release=JSON.parse(await readFile(join(root,'spec/release.json'),'utf8')) as {version:string};
 const commit=await capture(['git','rev-parse','--short=12','HEAD'])||'unknown';
 const exactTag=await capture(['git','describe','--tags','--exact-match','--match','umf-v*','HEAD']);
 const latestTag=await capture(['git','describe','--tags','--abbrev=0','--match','umf-v*','HEAD']);
 const released=exactTag===`umf-v${release.version}`;
 const label=released?`UMF ${release.version}`:`UMF ${release.version} (development build ${commit})${latestTag?` · latest release ${latestTag.replace(/^umf-v/,'')}`:''}`;
 const info={version:release.version,released,latestRelease:latestTag?latestTag.replace(/^umf-v/,''):null,commit,label};
 await writeFile(join(dist,'version.json'),JSON.stringify(info,null,2)+'\n');
 // Add the label to the footer of every hand-authored page in the site root.
 let stamped=0;
 for(const name of await readdir(join(root,'site')))if(name.endsWith('.html')){
  const path=join(dist,name),html=await readFile(path,'utf8');
  if(!html.includes('</footer>'))continue;
  await writeFile(path,html.replace('</footer>',`<span class="version" data-umf-version="${release.version}">${label}</span></footer>`));stamped++;
 }
 if(!stamped)throw Error('No page footer to stamp');
 console.log(`Stamped ${stamped} pages: ${label}`);
}

for(const [name,fn] of steps){
 if(only&&!only.includes(name))continue;
 if(skip.includes(name))continue;
 console.log(`\n== ${name}`);
 await fn();
}

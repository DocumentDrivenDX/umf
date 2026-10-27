// SPDX-License-Identifier: MIT OR Apache-2.0
// Preview-only, source-built R7 SDK archive. This does not write dist/ or the
// repository package manifest; all compiled assets live in a temporary tree.
import {createHash} from 'node:crypto';
import {cp,mkdir,mkdtemp,readFile,readdir,rm,symlink,writeFile} from 'node:fs/promises';
import {basename,join,relative,resolve} from 'node:path';
import {tmpdir} from 'node:os';

const workspaceRoot=process.cwd();
let root=workspaceRoot;
const output=resolve(process.env.UMF_RUST_PREVIEW_OUT??'target/rust-sdk-preview');
const scratch=await mkdtemp(join(tmpdir(),'umf-rust-sdk-preview-'));
const dist=join(scratch,'package','dist');
const cargoTarget=join(scratch,'cargo-target');
const wasmOut=join(scratch,'wasm-bindgen');
const packageRoot=join(scratch,'package');

async function run(command:string[],options:{cwd?:string;env?:Record<string,string|undefined>}={}){
 const child=Bun.spawn(command,{cwd:options.cwd??root,env:{...process.env,...options.env},stdout:'inherit',stderr:'inherit'});
 const code=await child.exited;
 if(code!==0)throw new Error(`Command failed (${code}): ${command.join(' ')}`);
}
async function capture(command:string[]){
 const child=Bun.spawn(command,{cwd:root,stdout:'pipe',stderr:'pipe'});
 const [stdout,stderr]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text()]);
 const code=await child.exited;
 if(code!==0)throw new Error(`${command.join(' ')} failed (${code}): ${stderr}`);
 return stdout.trim();
}
async function filesUnder(dir:string):Promise<string[]>{
 const output:string[]=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=join(dir,entry.name);
  if(entry.isDirectory())output.push(...await filesUnder(path));
  else if(entry.isFile())output.push(path);
 }
 return output;
}
async function digest(path:string){return createHash('sha256').update(await readFile(path)).digest('hex');}
async function treeDigest(paths:string[],baseRoot=workspaceRoot){
 const hash=createHash('sha256');
 for(const path of paths.sort()){
  hash.update(relative(baseRoot,path).split('\\').join('/'));hash.update('\0');hash.update(await readFile(path));hash.update('\0');
 }
 return hash.digest('hex');
}
async function inputHashes(paths:string[],baseRoot:string){
 const hashes:Record<string,string>={};
 for(const path of [...paths].sort())hashes[relative(baseRoot,path).split('\\').join('/')]=await digest(path);
 return hashes;
}
try{
 await mkdir(dist,{recursive:true});
 const rustc=await capture(['rustc','--version']);
 if(!rustc.startsWith('rustc 1.90.0 '))throw new Error(`Preview requires rustc 1.90.0, got ${rustc}`);
 const cargoSourceFiles=[
  ...await filesUnder(join(root,'crates/umf-core')),
  ...await filesUnder(join(root,'crates/umf-core-wire')),
  ...await filesUnder(join(root,'crates/umf-codegen')),
  ...await filesUnder(join(root,'crates/umf-cli')),
  ...await filesUnder(join(root,'crates/umf-metamodel')),
  ...await filesUnder(join(root,'crates/rust-spike-core')),
  ...await filesUnder(join(root,'crates/rust-spike-cli')),
  ...await filesUnder(join(root,'bindings/core/node/src')),
  ...await filesUnder(join(root,'bindings/core/wasm/src')),
  ...await filesUnder(join(root,'bindings/core/python')),
  ...await filesUnder(join(root,'bindings/rust-spike')),
  join(root,'bindings/core/node/Cargo.toml'),join(root,'bindings/core/node/build.rs'),
  join(root,'bindings/core/wasm/Cargo.toml'),
 ];
 const jsSourceFiles=[
  ...await filesUnder(join(root,'src')),
  ...await filesUnder(join(root,'bindings/core/node/src')),
  ...await filesUnder(join(root,'bindings/core/wasm/src')),
  join(root,'bindings/core/node/index.js'),
  join(root,'bindings/core/wasm/index.js'),
 ];
 const sourceInputs=[...new Set([
  join(root,'Cargo.lock'),join(root,'Cargo.toml'),join(root,'package.json'),join(root,'bun.lock'),join(root,'tsconfig.json'),join(root,'.github/workflows/rust-sdk-preview.yml'),
  join(root,'bindings/core/node/index.js'),join(root,'bindings/core/wasm/index.js'),
  join(root,'bindings/core/node/index.d.ts'),join(root,'bindings/core/wasm/index.d.ts'),
  join(root,'bindings/core/node/package.json'),join(root,'bindings/core/wasm/package.json'),
  join(root,'.cargo/config.toml'),
  join(root,'scripts/package-sdk-rust-preview.ts'),join(root,'scripts/test-sdk-rust-preview.ts'),
  join(root,'tests/access-host-read-v4.test.ts'),join(root,'tests/rust-codegen-default-v4.test.ts'),
  join(root,'scripts/test-rust-codegen-host-read-v4-node.ts'),join(root,'scripts/test-rust-codegen-host-read-v4-browser.ts'),
  ...cargoSourceFiles,...jsSourceFiles,...await filesUnder(join(root,'spec')),
  join(root,'tests/unified/commerce.json'),
  join(root,'docs/helix/04-build/evidence/rust-migration/r3/baseline/operations.json'),
  join(root,'docs/helix/02-design/spikes/security/policy-v0.2.schema.json'),
  ...await filesUnder(join(root,'native/tablespec')),
 ])].sort();
 const snapshotRoot=join(scratch,'source-snapshot');
 let sourceInputHashes:Record<string,string>={};
 let sourceHash='';
 let snapshotInputs:string[]=[];
 let captured=false;
 for(let attempt=1;attempt<=3&&!captured;attempt++){
  sourceInputHashes=await inputHashes(sourceInputs,workspaceRoot);
  sourceHash=await treeDigest(sourceInputs,workspaceRoot);
  await rm(snapshotRoot,{recursive:true,force:true});
  await mkdir(snapshotRoot,{recursive:true});
  snapshotInputs=[];
  for(const source of sourceInputs){
   const name=relative(workspaceRoot,source);
   const target=join(snapshotRoot,name);
   await mkdir(join(target,'..'),{recursive:true});
   await cp(source,target);
   snapshotInputs.push(target);
  }
  const liveAfterCopy=await inputHashes(sourceInputs,workspaceRoot);
  const copied=await inputHashes(snapshotInputs,snapshotRoot);
  captured=JSON.stringify(sourceInputHashes)===JSON.stringify(liveAfterCopy)&&JSON.stringify(sourceInputHashes)===JSON.stringify(copied);
  if(!captured&&attempt===3)throw new Error('Could not capture a stable source snapshot after three attempts');
 }
 await symlink(join(workspaceRoot,'node_modules'),join(snapshotRoot,'node_modules'),'dir');
 if(await treeDigest(snapshotInputs,snapshotRoot)!==sourceHash)throw new Error('Snapshot source closure hash mismatch');
 root=snapshotRoot;
 process.chdir(snapshotRoot);

 const nodeBuild=await Bun.build({entrypoints:['src/index-node-v4.ts'],outdir:dist,naming:'umf-rust-codegen-preview-v4-node.js',target:'node',format:'esm'});
 if(!nodeBuild.success)throw new Error(nodeBuild.logs.join('\n'));
 const defaultBuild=await Bun.build({entrypoints:['src/index.ts'],outdir:dist,naming:'umf.js',target:'browser',format:'esm'});
 if(!defaultBuild.success)throw new Error(defaultBuild.logs.join('\n'));

 const cargoEnv={CARGO_TARGET_DIR:cargoTarget};
 await run(['cargo','build','--release','--locked','--manifest-path','bindings/core/node/Cargo.toml'],{env:cargoEnv});
 const host=process.platform==='darwin'?'darwin':process.platform;
 const arch=process.arch;
 if(!((host==='darwin'&&arch==='arm64')||(host==='linux'&&arch==='x64')))throw new Error(`Unsupported preview native cohort: ${host}-${arch}`);
 const archId=arch==='x64'?'x86_64':arch==='arm64'?'aarch64':arch;
 const packageVersion=`0.5.6-preview.r7.${host}-${archId}`;
 const targetDir=join(cargoTarget,'release');
 const nativeCandidates=await filesUnder(targetDir);
 const native=nativeCandidates.find(path=>basename(path)===(host==='darwin'?'libumf_core_node.dylib':'libumf_core_node.so'));
 if(!native)throw new Error('Cargo did not produce the Node N-API cdylib');
 await cp(native,join(dist,'umf_core_node.node'));

 await run(['cargo','build','--release','--locked','--manifest-path','bindings/core/wasm/Cargo.toml','--target','wasm32-unknown-unknown'],{env:{CARGO_TARGET_DIR:cargoTarget}});
 const bindgen=Bun.spawn(['wasm-bindgen','--version'],{stdout:'pipe',stderr:'pipe'});
 const bindgenVersion=await new Response(bindgen.stdout).text();
 const bindgenError=await new Response(bindgen.stderr).text();
 if(await bindgen.exited!==0||bindgenVersion.trim()!=='wasm-bindgen 0.2.100')throw new Error(`Expected wasm-bindgen 0.2.100, got ${(bindgenVersion+bindgenError).trim()}`);
 await run(['wasm-bindgen','--target','web','--out-dir',wasmOut,'--out-name','umf_core_wasm',join(cargoTarget,'wasm32-unknown-unknown/release/umf_core_wasm.wasm')]);
 // TypeScript follows the browser entry's generated WASM import when emitting
 // declarations, so stage the generated binding declaration beside its source.
 const wasmSourcePackage=join(root,'bindings/core/wasm/pkg');
 await mkdir(wasmSourcePackage,{recursive:true});
 await cp(join(wasmOut,'umf_core_wasm.d.ts'),join(wasmSourcePackage,'umf_core_wasm.d.ts'));
 await run([process.execPath,'node_modules/typescript/bin/tsc','--emitDeclarationOnly','--outDir',dist]);
 // The browser root bundle inlines the generated wasm-bindgen glue; its
 // import.meta.url therefore resolves the binary beside that root bundle.
 await cp(join(wasmOut,'umf_core_wasm_bg.wasm'),join(dist,'umf_core_wasm_bg.wasm'));
 const browserBuild=await Bun.build({
  entrypoints:['src/index-browser-v4.ts'],outdir:dist,naming:'umf-rust-codegen-preview-v4-browser.js',target:'browser',format:'esm',
  plugins:[{name:'preview-built-wasm-glue',setup(build){build.onResolve({filter:/^\.\/pkg\/umf_core_wasm\.js$/},args=>args.importer.endsWith('bindings/core/wasm/index.js')?{path:join(wasmOut,'umf_core_wasm.js')}:undefined)}}],
 });
 if(!browserBuild.success)throw new Error(browserBuild.logs.join('\n'));

 const compiled=[...await filesUnder(dist)].sort();
 if(await treeDigest(snapshotInputs,snapshotRoot)!==sourceHash)throw new Error('Build input source closure changed during package creation');
 const manifest={
  format:'umf.r7-rust-sdk-preview/1',
  releaseStatus:'preview-only-not-default',
  profile:'umf.python-client-host-read/4',
  defaultRouteSource:'V4 synchronous Rust root-entry review candidate; archive is preview-only',
  packageVersion,
  platform:{os:host,arch:archId,nodeArch:arch,nativeTarget:host==='darwin'?'aarch64-apple-darwin':'x86_64-unknown-linux-gnu',napi:'N-API 8',runtimeCohort:['Node','Bun']},
  resources:{count:9,identity:'fixed-repository-owned'},
  limits:{recordPositions:10000,actionPositions:1000,selectedIdentityUtf16Units:4000000},
  api:{entry:'.',moduleLoad:'top-level-await-initialization',generator:'synchronous'},
  toolchain:{rustc,cargo:await capture(['cargo','--version']),bun:Bun.version,wasmBindgen:'0.2.100',cargoLockSha256:await digest(join(root,'Cargo.lock'))},
  sourceClosure:{sha256:sourceHash,coverage:'Private immutable snapshot verified against live source at capture; Cargo.lock and manifests; complete Rust package/source/resource trees; complete spec/ resource tree; complete TypeScript/JavaScript source tree; root package/build inputs; R3 parity corpus and V4 test inputs',fileCount:sourceInputs.length,inputs:sourceInputHashes},
  assets:Object.fromEntries(await Promise.all(compiled.map(async path=>[relative(packageRoot,path).split('\\').join('/'),await digest(path)]))),
 };
 await writeFile(join(dist,'rust-preview-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const pkg={
  name:'@umf/core',version:packageVersion,private:true,type:'module',
  files:['dist/'],
  exports:{
   '.':{
    types:'./dist/src/index.d.ts',
    browser:'./dist/umf-rust-codegen-preview-v4-browser.js',
    node:'./dist/umf-rust-codegen-preview-v4-node.js',
    import:'./dist/umf-rust-codegen-preview-v4-browser.js',
   },
   './rust-codegen-preview/v4':{
    types:'./dist/src/index-node-v4.d.ts',
    browser:'./dist/umf-rust-codegen-preview-v4-browser.js',
    node:'./dist/umf-rust-codegen-preview-v4-node.js',
    import:'./dist/umf-rust-codegen-preview-v4-browser.js',
   },
  },
 };
 await writeFile(join(packageRoot,'package.json'),JSON.stringify(pkg,null,2)+'\n');
 await mkdir(output,{recursive:true});
 const pack=Bun.spawn(['npm','pack','--pack-destination',output,'--json'],{cwd:packageRoot,env:{...process.env,npm_config_cache:join(output,'.npm-cache')},stdout:'pipe',stderr:'inherit'});
 const text=await new Response(pack.stdout).text();
 if(await pack.exited!==0)throw new Error('npm pack failed');
 const record=JSON.parse(text)[0] as {filename:string;files:{path:string;size:number;mode:number}[]};
 const archive=join(output,record.filename);
 const retainedRoot=join(output,'source-inputs',sourceHash.slice(0,16));
 await rm(retainedRoot,{recursive:true,force:true});
 await mkdir(retainedRoot,{recursive:true});
 const retainedInputs:string[]=[];
 for(const source of snapshotInputs){
  const name=relative(snapshotRoot,source);
  const target=join(retainedRoot,name);
  await mkdir(join(target,'..'),{recursive:true});
  await cp(source,target);
  retainedInputs.push(target);
 }
 await writeFile(join(retainedRoot,'SOURCE-CLOSURE.json'),JSON.stringify({sha256:sourceHash,fileCount:sourceInputs.length,inputs:sourceInputHashes},null,2)+'\n');
 if(await treeDigest(retainedInputs,retainedRoot)!==sourceHash)throw new Error('Retained source snapshot hash mismatch');
 const receipt={archive,archiveSha256:await digest(archive),sourceTreeSha256:sourceHash,sourceSnapshot:retainedRoot,manifestSha256:await digest(join(dist,'rust-preview-manifest.json')),members:record.files.map(file=>file.path).sort()};
 await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(JSON.stringify(receipt,null,2));
}finally{await rm(scratch,{recursive:true,force:true});}

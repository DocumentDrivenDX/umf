// SPDX-License-Identifier: MIT OR Apache-2.0
import {resolve,join,relative,basename} from 'node:path';
import {mkdir,copyFile,readFile,stat,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Ajv from 'ajv/dist/2020';
import standalone from 'ajv/dist/standalone';

const repo=resolve(import.meta.dir,'../../../..'),source=import.meta.dir;
function argument(name:string){const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];}
const wasmDir=argument('--wasm-dir');
if(!wasmDir)throw Error('Pass the fresh Rust/WASM output directory with --wasm-dir <directory>.');
const wasmPackage=resolve(wasmDir),output=resolve(argument('--output')??join(source,'dist'));
const names=['umf_core_wasm.js','umf_core_wasm_bg.wasm'] as const;
for(const name of names){const path=join(wasmPackage,name);if(!(await stat(path).catch(()=>undefined))?.isFile())throw Error(`Fresh Pack Tools WASM package is missing ${path}`);}
const wasmBytes=await readFile(join(wasmPackage,'umf_core_wasm_bg.wasm'));
if(wasmBytes.length<8||wasmBytes[0]!==0||wasmBytes[1]!==97||wasmBytes[2]!==115||wasmBytes[3]!==109||wasmBytes[4]!==1||wasmBytes[5]!==0||wasmBytes[6]!==0||wasmBytes[7]!==0)throw Error('Pack Tools build received an invalid WebAssembly module.');
const assets=join(output,'assets'),wasmAssets=join(assets,'pack-tools');await rm(wasmAssets,{recursive:true,force:true});await mkdir(wasmAssets,{recursive:true});
const catalogSchema=await Bun.file(join(repo,'docs/helix/05-deploy/schema-browser/catalog.schema.json')).json();
const catalogSchemaJson=JSON.stringify(catalogSchema);
const catalogAjv=new Ajv({allErrors:true,strict:true,allowUnionTypes:true,ownProperties:true,validateFormats:false,code:{source:true,esm:true}});
const catalogCheck=catalogAjv.compile(catalogSchema),standaloneCatalogValidator=standalone(catalogAjv,catalogCheck);
const catalogValidatorModule=standaloneCatalogValidator+`\nconst expectedCatalogSchema=${JSON.stringify(catalogSchemaJson)};\nexport function createValidator(){return {compile(schema){if(JSON.stringify(schema)!==expectedCatalogSchema)throw Error('Pack Tools only accepts the precompiled catalog schema');return validate;}};}\n`;
const fixedCatalogValidator={name:'pack-tools-fixed-catalog-validator',setup(build:any){build.onLoad({filter:/src[/\\]validation[/\\]schema\.ts$/},()=>({contents:catalogValidatorModule,loader:'js'}));}};
const build=await Bun.build({entrypoints:[join(source,'pack-tools.ts'),join(source,'pack-tools-worker.ts')],outdir:assets,target:'browser',format:'esm',splitting:false,minify:{whitespace:true,syntax:true,identifiers:false},metafile:true,plugins:[fixedCatalogValidator]});
if(!build.success)throw Error(build.logs.map(log=>String(log).slice(0,500)).join('\n'));
const builtNames=new Set(build.outputs.map(item=>item.path.split('/').at(-1)));
for(const name of ['pack-tools.js','pack-tools-worker.js'])if(!builtNames.has(name))throw Error(`Pack Tools bundle is missing ${name}`);
for(const name of names)await copyFile(join(wasmPackage,name),join(wasmAssets,name));
await copyFile(join(source,'pack-tools.css'),join(assets,'pack-tools.css'));
const hash=async(path:string)=>new Bun.CryptoHasher('sha256').update(await readFile(path)).digest('hex');
const sri=async(path:string)=>'sha256-'+createHash('sha256').update(await readFile(path)).digest('base64');
let page=await Bun.file(join(source,'pack-tools.html')).text();
page=page.replace('href="assets/pack-tools.css"',`href="assets/pack-tools.css" integrity="${await sri(join(assets,'pack-tools.css'))}" crossorigin="anonymous"`);
page=page.replace('src="assets/pack-tools.js"',`src="assets/pack-tools.js" integrity="${await sri(join(assets,'pack-tools.js'))}" crossorigin="anonymous"`);
await Bun.write(join(output,'pack-tools.html'),page);
const inputs:Record<string,string>={};
const metadata=typeof build.metafile==='string'?JSON.parse(build.metafile):build.metafile as any;
for(const input of Object.keys(metadata.inputs??{}).sort()){
 const path=resolve(repo,input);if(await Bun.file(path).exists())inputs[path.startsWith(repo)?path.slice(repo.length+1):path]=await hash(path);
}
for(const name of ['pack-tools.ts','pack-tools-model.ts','pack-tools-worker.ts','pack-tools-worker-client.ts','pack-tools-archive.ts','pack-tools.html','pack-tools.css','build-pack-tools.ts'])inputs[`docs/helix/05-deploy/microsite/${name}`]=await hash(join(source,name));
for(const path of ['package.json','bun.lock','docs/helix/05-deploy/schema-browser/catalog.schema.json'])inputs[path]=await hash(join(repo,path));
const wasmHashes=Object.fromEntries(await Promise.all(names.map(async name=>[name,await hash(join(wasmPackage,name))] as const)));
const outputHashes:Record<string,string>={};
for(const name of ['assets/pack-tools.js','assets/pack-tools-worker.js','assets/pack-tools.css',...names.map(name=>`assets/pack-tools/${name}`)])outputHashes[name]=await hash(join(output,name));
const compilerScope=['bindings/pack-tools/wasm/Cargo.toml','bindings/pack-tools/wasm/src/lib.rs','Cargo.toml','Cargo.lock','crates/umf-codegen/Cargo.toml','crates/umf-codegen/src/lib.rs','crates/umf-codegen/src/pack_tools.rs','crates/umf-core-wire/Cargo.toml','crates/umf-core-wire/src/lib.rs','crates/umf-core-wire/src/native_family_binding.rs','crates/umf-core-wire/src/pack_tools_binding.rs','bindings/core/wasm/Cargo.toml','bindings/core/wasm/src/native-family.js','bindings/core/node/src/native-family.js','src/domain-packs/pack-tools-types.ts','src/domain-packs/pack-tools-rust.ts'];
const compilerInputs:Record<string,string>={},compilerInputsMissing:string[]=[];
for(const path of compilerScope){const absolute=join(repo,path);if(await Bun.file(absolute).exists())compilerInputs[path]=await hash(absolute);else compilerInputsMissing.push(path);}
const revision=Bun.spawnSync(['git','rev-parse','HEAD'],{cwd:repo}),working=Bun.spawnSync(['git','status','--porcelain'],{cwd:repo});
const wasmRelative=relative(repo,wasmPackage),wasmOrigin=wasmRelative==='..'||wasmRelative.startsWith('../')?'external:'+basename(wasmPackage):wasmRelative;
const receipt={profile:'umf.pack-tools-browser-build/1',baseRevision:revision.exitCode===0?revision.stdout.toString().trim():'',workingTreeDirty:working.exitCode===0?working.stdout.toString().trim().length>0:null,bun:Bun.version,wasmPackage:wasmOrigin,inputs:Object.fromEntries(Object.entries(inputs).sort()),compilerInputScope:compilerScope,compilerInputs:Object.fromEntries(Object.entries(compilerInputs).sort()),compilerInputsMissing,wasm:wasmHashes,outputs:outputHashes,unsignedPageHtmlSha256:await hash(join(output,'pack-tools.html'))};
await Bun.write(join(wasmAssets,'provenance.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(`Pack Tools browser assets built at ${output}; Rust/WASM inputs copied from ${wasmPackage}.`);

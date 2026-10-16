import {mkdir,rm,copyFile as copySource,chmod} from 'node:fs/promises';
// Go toolchain cache files can be read-only; repeated builds own their output copies.
async function copyFile(source:string,target:string){try{await chmod(target,0o644);}catch(error:any){if(error.code!=='ENOENT')throw error;}await copySource(source,target);}
const goVersion=Bun.spawn(['go','env','GOVERSION'],{stdout:'pipe'});
if((await new Response(goVersion.stdout).text()).trim()!=='go1.27.1'||await goVersion.exited)throw new Error('Protobuf compiler build requires Go 1.27.1');
await mkdir('dist/protobuf',{recursive:true});
const build=Bun.spawn(['go','build','-trimpath','-buildvcs=false','-o','../../dist/protobuf/compiler.wasm','.'],{cwd:'native/protobuf',env:{...process.env,GOOS:'js',GOARCH:'wasm'},stdout:'inherit',stderr:'inherit'});
if(await build.exited)process.exit(1);
const root=Bun.spawn(['go','env','GOROOT'],{stdout:'pipe'});
const path=(await new Response(root.stdout).text()).trim();if(await root.exited)process.exit(1);
await copyFile(path+'/lib/wasm/wasm_exec.js','dist/protobuf/wasm_exec.js');
await copyFile('native/protobuf/worker.js','dist/protobuf/worker.js');
console.log('Protobuf WASM compiler built');
// Only the modules compiled into this target own compiler license assets.
// Go's full graph includes test-only modules whose cache directories vary by host.
const modules=Bun.spawn(['go','list','-deps','-f','{{with .Module}}{{.Path}}|{{.Version}}|{{.Dir}}{{end}}','.'],{cwd:'native/protobuf',env:{...process.env,GOOS:'js',GOARCH:'wasm'},stdout:'pipe',stderr:'inherit'});
const dependencies=await new Response(modules.stdout).text();if(await modules.exited)process.exit(1);
const licenses=new Map<string,string>();
for(const line of dependencies.trim().split('\n')){
 const[name,version,directory]=line.split('|');
 if(!version||!name)continue;
 if(!directory)throw new Error('Missing compiled dependency directory: '+name);
 const file=Bun.file(directory+'/LICENSE');
 if(!await file.exists())throw new Error('Missing dependency license: '+name);
 licenses.set(name,await file.text());
}
const pinned=Bun.spawn(['go','list','-m','-f','{{.Path}}|{{.Version}}','all'],{cwd:'native/protobuf',stdout:'pipe',stderr:'inherit'});
const graph=await new Response(pinned.stdout).text();if(await pinned.exited)process.exit(1);
// Replace this owned generated directory: stale cached-module licenses must not survive.
await rm('dist/protobuf/licenses',{recursive:true,force:true});
await mkdir('dist/protobuf/licenses',{recursive:true});
const goLicense=await Bun.file(path+'/LICENSE').exists()?path+'/LICENSE':path+'/../LICENSE';
await copyFile(goLicense,'dist/protobuf/licenses/Go-LICENSE');
for(const[name,license]of [...licenses].sort(([a],[b])=>a<b?-1:a>b?1:0))await Bun.write('dist/protobuf/licenses/'+name.replaceAll('/','-')+'-LICENSE',license);
await Bun.write('dist/protobuf/NOTICE.txt','Optional UMF Protobuf compiler. Built with Go 1.27.1.\nPinned module graph (module|version):\n'+graph+'\nSee licenses/ for Go and compiled dependency license texts.\n');

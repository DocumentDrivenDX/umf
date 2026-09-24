import {mkdir,copyFile} from 'node:fs/promises';
const goVersion=Bun.spawn(['go','env','GOVERSION'],{stdout:'pipe'});
if((await new Response(goVersion.stdout).text()).trim()!=='go1.27.1'||await goVersion.exited)throw new Error('Protobuf compiler build requires Go 1.27.1');
await mkdir('dist/protobuf',{recursive:true});
const build=Bun.spawn(['go','build','-trimpath','-o','../../dist/protobuf/compiler.wasm','.'],{cwd:'native/protobuf',env:{...process.env,GOOS:'js',GOARCH:'wasm'},stdout:'inherit',stderr:'inherit'});
if(await build.exited)process.exit(1);
const root=Bun.spawn(['go','env','GOROOT'],{stdout:'pipe'});
const path=(await new Response(root.stdout).text()).trim();if(await root.exited)process.exit(1);
await copyFile(path+'/lib/wasm/wasm_exec.js','dist/protobuf/wasm_exec.js');
await copyFile('native/protobuf/worker.js','dist/protobuf/worker.js');
console.log('Protobuf WASM compiler built');
await mkdir('dist/protobuf/licenses',{recursive:true});
const goLicense=await Bun.file(path+'/LICENSE').exists()?path+'/LICENSE':path+'/../LICENSE';
await copyFile(goLicense,'dist/protobuf/licenses/Go-LICENSE');
const modules=Bun.spawn(['go','list','-m','-f','{{.Path}}|{{.Version}}|{{.Dir}}','all'],{cwd:'native/protobuf',stdout:'pipe',stderr:'inherit'});
const dependencies=await new Response(modules.stdout).text();if(await modules.exited)process.exit(1);
for(const line of dependencies.trim().split('\n')){
 const[name,version,directory]=line.split('|');
 if(!version||!name||!directory)continue;
 const file=Bun.file(directory+'/LICENSE');
 if(!await file.exists())throw new Error('Missing dependency license: '+name);
 await Bun.write('dist/protobuf/licenses/'+name.replaceAll('/','-')+'-LICENSE',await file.text());
}
await Bun.write('dist/protobuf/NOTICE.txt','Optional UMF Protobuf compiler. Built with Go 1.27.1.\nPinned modules:\n'+dependencies+'\nSee licenses/ for license texts.');

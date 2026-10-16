/** Build the private Bun child with original dependency notices. */
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {resolve,join,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dir,'../..'),destination=process.argv[2];
if(!destination||!isAbsolute(destination)||process.argv.length!==3)throw Error('One absolute fresh output directory required');
await mkdir(destination);process.chdir(root);
// Bun consumes root configuration outside its executable-input metafile.
// This profile deliberately refuses inherited config rather than leaving an
// unrecorded local/package/remote extends chain in the build's source basis.
const buildConfigurationPaths=['tsconfig.json','bunfig.toml'];
const buildConfigurationBytes=await Promise.all(buildConfigurationPaths.map(p=>readFile(join(root,p))));
const tsconfig=JSON.parse(buildConfigurationBytes[0]!.toString('utf8'));
if(!tsconfig||typeof tsconfig!=='object'||Array.isArray(tsconfig)||Object.hasOwn(tsconfig,'extends'))throw Error('Standalone root TypeScript configuration required');
async function checkBuildConfiguration(){for(let i=0;i<buildConfigurationPaths.length;i++)if(!(await readFile(join(root,buildConfigurationPaths[i]!))).equals(buildConfigurationBytes[i]!))throw Error('Build configuration changed');}
const config={entrypoints:['tools/security/current-native-disclosure-child-main.ts'],target:'bun' as const,format:'esm' as const,metafile:true,tsconfig:join(root,'tsconfig.json')};
const discover=await Bun.build(config);if(!discover.success||!discover.metafile)throw Error('Private child discovery refused');
const parseMeta=(raw:any):any=>typeof raw==='string'?JSON.parse(raw):raw;
const inputs=Object.keys(parseMeta(discover.metafile).inputs).sort(),hash=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const sourcePins:Record<string,string>={};for(const input of [...inputs,'tools/security/build-current-native-disclosure-child.ts','bun.lock','package.json',...buildConfigurationPaths])sourcePins[input]=hash(await readFile(resolve(root,input)));
await checkBuildConfiguration();
const built=await Bun.build(config);
if(!built.success||!built.metafile||built.outputs.length!==1)throw Error('Private child build refused');
const metadata=parseMeta(built.metafile);if(JSON.stringify(Object.keys(metadata.inputs).sort())!==JSON.stringify(inputs))throw Error('Build closure changed');
const bundle=new Uint8Array(await built.outputs[0]!.arrayBuffer());
const packages=new Set<string>();for(const input of inputs)if(input.startsWith('node_modules/')){const p=input.split('/');packages.add(p.slice(0,p[1]!.startsWith('@')?3:2).join('/'));}
await writeFile(join(destination,'current-native-disclosure-child.mjs'),bundle);await writeFile(join(destination,'metafile.json'),JSON.stringify(metadata,null,2)+'\n');
const notices=[];await mkdir(join(destination,'notices'));
for(const path of [...packages].sort()){
 const original=resolve(root,path),pkg=JSON.parse(await readFile(join(original,'package.json'),'utf8')),target=join(destination,'notices',pkg.name.replace('/','__'));await mkdir(target);
 const files=(await readdir(original)).filter(name=>/^(licen[sc]e|notice|copying|copyright)([. _-]|$)/i.test(name));if(!files.length)throw Error('Original notice absent: '+pkg.name);
 for(const name of ['package.json',...files])await writeFile(join(target,name),await readFile(join(original,name)));
 notices.push({name:pkg.name,version:pkg.version,license:pkg.license,files});
}
await writeFile(join(destination,'umf-package.json'),await readFile(join(root,'package.json')));
await checkBuildConfiguration();
for(const input of Object.keys(sourcePins))if(hash(await readFile(resolve(root,input)))!==sourcePins[input])throw Error('Build source changed');
const manifest={profile:'umf.security.private-disclosure-child/0.2-candidate',bun:Bun.version,bundleSha256:hash(bundle),sourcePins,buildConfiguration:{paths:buildConfigurationPaths,inheritedTypeScriptConfiguration:'refused'},notices,sourceCapture:'Discovery then pre-build pins, actual build, exact closure equality and post-build pins',scope:'Original private computation only; no database, native issuer, permission or guarded release'};
await writeFile(join(destination,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({directory:destination,bundleSha256:manifest.bundleSha256,inputs:inputs.length,notices:notices.length}));

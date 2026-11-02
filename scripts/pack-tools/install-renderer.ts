// SPDX-License-Identifier: MIT OR Apache-2.0
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,join,relative,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync} from 'node:zlib';
import {verifySiteAssets} from '../../docs/helix/05-deploy/schema-browser/site-assets';

const repo=resolve(import.meta.dir,'../..');
const packageName='@documentdrivendx/umf-schema-browser';
const maxCompressedBytes=64*1024*1024,maxUnpackedBytes=256*1024*1024;
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');

function parsePax(source:Buffer){
 const values:Record<string,string>={};let offset=0;
 while(offset<source.length){const space=source.indexOf(0x20,offset);if(space<0)throw Error('Malformed PAX record length');const length=Number(source.subarray(offset,space).toString('ascii'));if(!Number.isSafeInteger(length)||length<=space-offset+1||offset+length>source.length)throw Error('Malformed PAX record');const record=source.subarray(space+1,offset+length).toString('utf8').replace(/\n$/,'');const split=record.indexOf('=');if(split<1)throw Error('Malformed PAX key/value');values[record.slice(0,split)]=record.slice(split+1);offset+=length;
 }
 return values;
}
function tarNumber(field:Buffer){const raw=field.toString('ascii').replace(/\0.*$/s,'').trim();if(!raw)return 0;if(!/^[0-7]+$/.test(raw))throw Error('Unsupported non-octal tar size');const value=parseInt(raw,8);if(!Number.isSafeInteger(value)||value<0)throw Error('Invalid tar size');return value;}
function tarPath(header:Buffer){const name=header.subarray(0,100).toString('utf8').replace(/\0.*$/s,'');const prefix=header.subarray(345,500).toString('utf8').replace(/\0.*$/s,'');return prefix?`${prefix}/${name}`:name;}
function safeRelativeTarPath(name:string){
 const value=name.replace(/^\.\//,'').replace(/\/+$/,'');
 if(!value||value.startsWith('/')||value.includes('\\')||value.split('/').some(part=>!part||part==='.'||part==='..')||value!=='package'&&!value.startsWith('package/'))throw Error(`Unsafe package archive path: ${name}`);
 return value;
}
async function extractPackageTarball(tarball:Buffer,destination:string){
 if(tarball.length>maxCompressedBytes)throw Error('Packed schema-browser exceeds the compressed size limit.');
 const archive=gunzipSync(tarball,{maxOutputLength:maxUnpackedBytes});let offset=0,globalPax:Record<string,string>={},localPax:Record<string,string>={},total=0;const seen=new Set<string>();
 while(offset+512<=archive.length){const header=archive.subarray(offset,offset+512);if(header.every(byte=>byte===0))break;const headerSize=tarNumber(header.subarray(124,136)),type=String.fromCharCode(header[156]||0),dataStart=offset+512,dataSize=Number(localPax.size??globalPax.size??headerSize);if(!Number.isSafeInteger(dataSize)||dataSize<0||dataStart+dataSize>archive.length)throw Error('Invalid package tar entry size.');const body=archive.subarray(dataStart,dataStart+dataSize);offset=dataStart+Math.ceil(dataSize/512)*512;
  if(type==='x'||type==='g'){const values=parsePax(body);if(type==='g')globalPax={...globalPax,...values};else localPax=values;continue;}
  if(type!=='0'&&type!=='\0'&&type!=='5')throw Error(`Unsupported package tar entry type ${JSON.stringify(type)}.`);
  const name=safeRelativeTarPath(localPax.path??globalPax.path??tarPath(header));localPax={};if(seen.has(name))throw Error(`Duplicate package archive path ${name}`);seen.add(name);const target=resolve(destination,name);if(target!==destination&&!target.startsWith(destination+sep))throw Error(`Package archive path escapes extraction root: ${name}`);
  total+=body.length;if(total>maxUnpackedBytes)throw Error('Packed schema-browser exceeds the unpacked size limit.');
  if(type==='5'){await mkdir(target,{recursive:true});continue;}
  await mkdir(dirname(target),{recursive:true});await writeFile(target,body);
 }
 if(!seen.has('package/package.json'))throw Error('Package archive does not contain package/package.json.');
}
async function run(args:string[]){const child=Bun.spawn(args,{cwd:repo,stdout:'pipe',stderr:'pipe'});const [stdout,stderr,exitCode]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(exitCode!==0)throw Error(stderr||stdout||`Command failed: ${args[0]}`);return stdout;}

const manifest=JSON.parse(await Bun.file(join(repo,'package.json')).text());const pin=manifest.devDependencies?.[packageName];
if(typeof pin!=='string'||!/^\d+\.\d+\.\d+$/.test(pin))throw Error('Schema browser must use an exact package.json version pin.');
const lock=Bun.JSONC.parse(await Bun.file(join(repo,'bun.lock')).text()) as any,lockEntry=lock.packages?.[packageName];
if(!Array.isArray(lockEntry)||lockEntry[0]!==`${packageName}@${pin}`||typeof lockEntry[3]!=='string'||!lockEntry[3].startsWith('sha512-'))throw Error('bun.lock does not contain an exact schema-browser package integrity for the package.json pin.');
const expectedIntegrity=lockEntry[3];
const temporary=await mkdtemp(join(tmpdir(),'umf-schema-browser-deploy-'));
try{
 const packedJson=await run(['npm','pack',`${packageName}@${pin}`,'--ignore-scripts','--json','--pack-destination',temporary]);
 const packed=JSON.parse(packedJson);if(!Array.isArray(packed)||packed.length!==1||packed[0]?.name!==packageName||packed[0]?.version!==pin||typeof packed[0]?.filename!=='string')throw Error('npm pack returned a different schema-browser package identity.');
 const tarballPath=join(temporary,packed[0].filename),tarball=await readFile(tarballPath),actualIntegrity='sha512-'+createHash('sha512').update(tarball).digest('base64');
 if(actualIntegrity!==expectedIntegrity)throw Error('Packed schema-browser tarball does not match bun.lock integrity.');
 const extracted=join(temporary,'extract');await mkdir(extracted,{recursive:true});await extractPackageTarball(tarball,extracted);
 const packageRoot=join(extracted,'package'),packageJson=JSON.parse(await Bun.file(join(packageRoot,'package.json')).text());
 if(packageJson.name!==packageName||packageJson.version!==pin)throw Error('Extracted schema-browser package does not match the exact lock pin.');
 await run([process.execPath,join(repo,'docs/helix/05-deploy/schema-browser/publish-site.ts'),packageRoot]);
 const site=join(repo,'docs/helix/05-deploy/microsite/dist'),verified=await verifySiteAssets(packageRoot,site,pin);
 console.log(JSON.stringify({profile:'umf.schema-browser.deployment-artifact/1',package:packageName,version:pin,lockIntegrity:expectedIntegrity,tarballSha256:hash(tarball),verifiedAssets:Object.keys(verified.assets).length,site:relative(repo,site)},null,2));
}finally{await rm(temporary,{recursive:true,force:true});}

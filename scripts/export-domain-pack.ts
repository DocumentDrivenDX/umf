import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {mkdir,copyFile,realpath} from 'node:fs/promises';
import {importTableSpec,exportTableSpec} from '../src/adapters/tablespec';
import {createValidator} from '../src/validation/schema';
import {generateDomainPackSchema} from '../src/domain-packs/schema';
const args=process.argv.slice(2),input=args[args.indexOf('--pack')+1],output=args[args.indexOf('--output')+1];
if(!args.includes('--pack')||!args.includes('--output')||!input||!output)throw Error('Usage: --pack <pack.json> --output <directory> [--check] [--include-sources]');
const value=await Bun.file(input).json(),validate=createValidator().compile(generateDomainPackSchema());
if(!validate(value))throw Error('Invalid domain-pack metadata');
const pack=value as {id:string;schemas?:{id:string;format:string;reference:string}[];sources?:Record<string,{kind:string;reference?:string;checksum?:{algorithm:string;value:string};license?:{redistribution?:string}}>};
const root=resolve(dirname(input)),destination=resolve(output),check=args.includes('--check');
// Caller-supplied local schema artifacts are exported by default. Sources need
// explicit inclusion below; this command never downloads source data.
const entries=[['domain-pack.json',Bun.file(input)]] as [string,ReturnType<typeof Bun.file>][];
for(const entry of pack.schemas??[]){
 const source=resolve(root,entry.reference),local=relative(root,source);
 if(isAbsolute(entry.reference)||local==='..'||local.startsWith('../')||isAbsolute(local))throw Error('Schema reference leaves pack directory');
 const actual=await realpath(source),inside=relative(await realpath(root),actual);
 if(inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error('Schema symlink leaves pack directory');
 if(entry.format==='tablespec'){const text=await Bun.file(actual).text();if(exportTableSpec(importTableSpec(text,{id:entry.id,format:'json'}))!==text)throw Error('Native schema recovery differs');}
 entries.push([entry.reference,Bun.file(actual)]);
}
// Explicit opt-in copies pinned, cleared local sources; remote references remain
// metadata. Reuse the same lexical/realpath boundary as schema exports.
if(args.includes('--include-sources'))for(const source of Object.values(pack.sources??{})){
 const reference=source.reference;
 if(!reference||reference.includes(':'))continue;
 if(source.kind!=='external'||source.license?.redistribution!=='allowed')throw Error('Source redistribution is not cleared');
 if(source.checksum?.algorithm!=='sha256')throw Error('Source checksum is required');
 const path=resolve(root,reference),local=relative(root,path);
 if(isAbsolute(reference)||local==='..'||local.startsWith('../')||isAbsolute(local))throw Error('Source reference leaves pack directory');
 const actual=await realpath(path),inside=relative(await realpath(root),actual);
 if(inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error('Source symlink leaves pack directory');
 const file=Bun.file(actual),hash=new Bun.CryptoHasher('sha256').update(await file.arrayBuffer()).digest('hex');
 if(hash!==source.checksum.value)throw Error('Source checksum differs');
 if(entries.some(([name])=>name===reference))throw Error('Duplicate export artifact path');
 entries.push([reference,file]);
}
for(const [name,file] of entries){
 const target=resolve(destination,name);
 if(check){
  if(!await Bun.file(target).exists())throw Error('Stale pack export: '+name);
  const actual=new Uint8Array(await Bun.file(target).arrayBuffer()),expected=new Uint8Array(await file.arrayBuffer());
  if(actual.length!==expected.length||actual.some((byte,index)=>byte!==expected[index]))throw Error('Stale pack export: '+name);
 }
 else{await mkdir(dirname(target),{recursive:true});await copyFile(file.name!,target);}
}
console.log(JSON.stringify({pack:pack.id,schemas:pack.schemas?.length??0,artifacts:entries.length,checked:check}));

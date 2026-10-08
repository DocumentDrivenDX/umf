import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {mkdir,copyFile,realpath} from 'node:fs/promises';
import {importTableSpec,exportTableSpec} from '../src/adapters/tablespec';
import {createValidator} from '../src/validation/schema';
import {generateDomainPackSchema} from '../src/domain-packs/schema';
const args=process.argv.slice(2),input=args[args.indexOf('--pack')+1],output=args[args.indexOf('--output')+1];
if(!args.includes('--pack')||!args.includes('--output')||!input||!output)throw Error('Usage: --pack <pack.json> --output <directory> [--check]');
const value=await Bun.file(input).json(),validate=createValidator().compile(generateDomainPackSchema());
if(!validate(value))throw Error('Invalid domain-pack metadata');
const pack=value as {id:string;schemas?:{id:string;format:string;reference:string}[]};
const root=resolve(dirname(input)),destination=resolve(output),check=args.includes('--check');
// Only caller-supplied local schema artifacts are exported. Dataset sources
// remain opaque references: this command never downloads source data.
const entries=[['domain-pack.json',Bun.file(input)]] as [string,ReturnType<typeof Bun.file>][];
for(const entry of pack.schemas??[]){
 const source=resolve(root,entry.reference),local=relative(root,source);
 if(isAbsolute(entry.reference)||local==='..'||local.startsWith('../')||isAbsolute(local))throw Error('Schema reference leaves pack directory');
 const actual=await realpath(source),inside=relative(await realpath(root),actual);
 if(inside==='..'||inside.startsWith('../')||isAbsolute(inside))throw Error('Schema symlink leaves pack directory');
 if(entry.format==='tablespec'){const text=await Bun.file(actual).text();if(exportTableSpec(importTableSpec(text,{id:entry.id,format:'json'}))!==text)throw Error('Native schema recovery differs');}
 entries.push([entry.reference,Bun.file(actual)]);
}
for(const [name,file] of entries){
 const target=resolve(destination,name);
 if(check){if(!await Bun.file(target).exists()||await Bun.file(target).text()!==await file.text())throw Error('Stale pack export: '+name);}
 else{await mkdir(dirname(target),{recursive:true});await copyFile(file.name!,target);}
}
console.log(JSON.stringify({pack:pack.id,schemas:entries.length-1,checked:check}));

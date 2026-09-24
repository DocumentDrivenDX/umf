import {Registry} from '../src/registry/registry';
import type {ExtensionPackage} from '../src/model/types';
import {isDeepStrictEqual} from 'node:util';
import {resolve,relative,isAbsolute} from 'node:path';

// Development-only inventory check. A passing audit does not establish native conformance.
const registry=new Registry(),root=resolve('.'),rows=[];
const paths=await Array.fromAsync(new Bun.Glob('spec/extensions/*/package.json').scan({cwd:root}));
for(const path of paths.sort()){
 const failures:string[]=[];
 let manifest:ExtensionPackage|undefined;
 try{
  manifest=await Bun.file(path).json();
  registry.register(manifest!);
  const schemaPath=path.replace(/package\.json$/,'schema.json');
  if(!await Bun.file(schemaPath).exists())failures.push('Missing standalone payload schema');
  else if(!isDeepStrictEqual(manifest!.schema,await Bun.file(schemaPath).json()))failures.push('Embedded and standalone payload schemas differ');
  for(const evidence of manifest!.capabilities.evidence){
   const target=resolve(root,evidence),local=relative(root,target);
   if(local==='..'||local.startsWith('../')||isAbsolute(local))failures.push('Evidence path leaves repository: '+evidence);
   else if(!await Bun.file(target).exists())failures.push('Missing evidence: '+evidence);
  }
  if(!manifest!.capabilities.evidence.length)failures.push('No declared evidence');
 }catch(error){failures.push(String(error));}
 rows.push({path,id:manifest?.id??null,version:manifest?.version??null,native:manifest?.capabilities?.native??null,evidenceCount:manifest?.capabilities?.evidence?.length??0,passed:failures.length===0,failures});
}
if(!rows.length)throw Error('No extension packages found');
const result={scope:'Manifest validation, joint registry registration, standalone schema equality and local evidence existence only; no native conformance or inventory completeness claim',packages:rows.length,passed:rows.filter(r=>r.passed).length,results:rows};
await Bun.write('fixtures/extension-package-audit.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({packages:result.packages,passed:result.passed,failures:rows.filter(r=>!r.passed)},null,2));
if(result.passed!==result.packages)process.exitCode=1;

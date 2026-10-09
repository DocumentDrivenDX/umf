import {readJsonValue} from '../../src/model/serialization';
import {ontology} from './ontology';
/** Host-only profile and ontology admission for the portable graph projector. */
import {realpath} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {inspectDomainPack} from '../../src/domain-packs/profile';
import {readDocument} from '../../src/model/document';
import {validateDocument} from '../../src/validation/document';
const path=resolve(process.argv[2]!);const root=await realpath(dirname(path));
const pack:any=readJsonValue(await Bun.file(path).text(),'json'),admission=inspectDomainPack(pack);
if(!admission.valid||!admission.complete)throw Error(admission.diagnostics.join('; ')||'Execution profile required');
for(const s of pack.schemas){
 if(isAbsolute(s.reference)||s.reference.includes(':')||s.reference.split(/[\\/]/).includes('..'))throw Error('Nonlocal schema');
 const file=await realpath(resolve(root,s.reference)),rel=relative(root,file);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Schema escapes pack');
 if(Bun.file(file).size>10*1024*1024)throw Error('Schema byte budget');
 if(s.format==='umf'){const result=validateDocument(readDocument(await Bun.file(file).text(),'json'));if(!result.valid||!result.complete)throw Error('Invalid ontology: '+JSON.stringify(result.diagnostics));}
}
const specs=await Promise.all(pack.execution_profile.targets.tabular.map(async (id:string)=>{const declaration=pack.schemas.find((s:any)=>s.id===id);return Bun.file(resolve(root,declaration.reference)).json();}));
const expected=ontology(pack.id,specs).modules[0]!;
for(const id of pack.execution_profile.targets.graph){
 const declaration=pack.schemas.find((s:any)=>s.id===id),doc=await Bun.file(resolve(root,declaration.reference)).json(),module=doc.modules.find((m:any)=>m.id==='domain');
 if(!module)throw Error('Missing ontology mapping module');
 for(const element of expected.elements){
  const actual=module.elements.find((e:any)=>e.id===element.id);if(!actual)throw Error('Missing mapped ontology element');
  for(const key of ['kind','members','keys','scalarType','cardinality','nullability','facets'])if(JSON.stringify(actual[key])!==JSON.stringify(element[key]))throw Error('Ontology semantics differ: '+element.id+'/'+key);
 }
 for(const relationship of expected.relationships){const actual=module.relationships?.find((r:any)=>r.id===relationship.id);if(!actual)throw Error('Missing mapped relationship');for(const key of ['source','target','sourceMultiplicity','targetMultiplicity','targetLifecycle','directed'])if(JSON.stringify(actual[key])!==JSON.stringify(relationship[key]))throw Error('Relationship semantics differ: '+relationship.id+'/'+key);}
}
console.log(JSON.stringify(admission));

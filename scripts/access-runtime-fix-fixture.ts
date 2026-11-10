// SPDX-License-Identifier: MIT OR Apache-2.0
/** Host-only actual source fixture for the installed two-wheel runtime proof. */
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {generateAccessPackage} from '../src/compilation/index';
import {profile,request,mutateSource} from '../tests/compilation/access-fixtures';

const destination=process.argv[2],selectedPath=process.argv[3];
if(!destination?.startsWith('/private/tmp/'))throw Error('Explicit scratch destination required');
const admitted={
 'umf-access-local-production-replay':{python:'3.14.8',pydantic:'2.14.1',core:'2.50.1'},
 'umf-access-local-linux311-identity-qualification':{python:'3.11.17',pydantic:'2.13.5',core:'2.46.5'},
} as const;
const selected=selectedPath?JSON.parse(await readFile(selectedPath,'utf8')) as Record<string,any>:null;
const pins=selected&&admitted[selected.id as keyof typeof admitted];
if(selectedPath&&!pins)throw Error('Only fixed selected Access profiles are admitted');
if(selected&&(!pins||selected.python!==pins.python||selected.version!=='0.1.0'||selected.runtimeAbi?.distribution!=='umf_access'||selected.runtimeAbi?.version!=='0.1.0.dev10'||selected.runtimeAbi?.abi!=='umf-access-runtime/0.1'||selected.runtimeDependencies?.pydantic!==pins.pydantic||selected.runtimeDependencies?.['pydantic-core']!==pins.core))throw Error('Selected profile identity or dependency pins differ');
if(selected){
 const relative=selected.id==='umf-access-local-linux311-identity-qualification'
  ?'../python/umf_access/compatibility-profile-linux311.json'
  :'../python/umf_access/compatibility-profile.json';
 const fixed=JSON.parse(await readFile(new URL(relative,import.meta.url),'utf8'));
 if(JSON.stringify(selected)!==JSON.stringify(fixed))throw Error('Selected profile differs from the exact checked-in profile');
}

const q=request();q.package='runtime_fix';q.projections=[];
let readBinding:Record<string,unknown>|null=null;
if(selected){
 const logicalText=await readFile(new URL('../fixtures/access/commerce/postgresql18.json',import.meta.url),'utf8');
 const physicalText=await readFile(new URL('../fixtures/access/commerce/postgresql18-binding.json',import.meta.url),'utf8');
 const logical=JSON.parse(logicalText),physical=JSON.parse(physicalText);
 const logicalModule=logical.modules.find((item:any)=>item.id==='commerce');
 const physicalExtension=physical.extensions?.['umf.binding'];
 const columnSets=logicalModule?.extensions?.['umf.access']?.columns;
 const columnSet=Array.isArray(columnSets)?columnSets[0]:undefined;
 const physicalTable=physicalExtension?.elements?.find((item:any)=>item.module==='commerce'&&item.element==='Order');
 const order=logicalModule?.elements?.find((item:any)=>item.kind==='record'&&item.id==='Order');
 const primary=order?.keys?.filter((item:any)=>item.primary===true);
 if(!logicalModule||!physicalExtension||!Array.isArray(columnSets)||columnSets.length!==1||!columnSet||!physicalTable||!Array.isArray(primary)||primary.length!==1)throw Error('Original generated-join logical/physical source binding is incomplete');
 q.sources=[{id:'logical',format:'json',text:logicalText},{id:'orders-binding',format:'json',text:physicalText}];
 q.bindings=['orders-binding'];q.records=[{module:'commerce',element:'Order'}];q.actions=[];
 q.projections=[{name:'orderIdentity',record:q.records[0]!,fields:[{module:'commerce',element:'orderId'},{module:'commerce',element:'amount'}]}];
 const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
 const physicalFields=physicalExtension.fields as {module:string;element:string;column:string;storage:string}[];
 const fields=q.projections[0]!.fields.map(ref=>{
  const sourceField=logicalModule.elements.find((item:any)=>item.kind==='field'&&item.id===ref.element);
  const storage=physicalFields.find(item=>item.module===ref.module&&item.element===ref.element&&item.storage==='column');
  const carrier=sourceField?.scalarType;
  if(!sourceField||!storage||!['string','integer','decimal','boolean'].includes(carrier))throw Error('Selected source field lacks an exact supported physical binding');
  return {logical:ref.element,native:storage.column,carrier,nullable:sourceField.nullability!=='required'};
 });
 readBinding={
  version:'umf.raw-read-binding/0.1',schema:null,
  modelSha256:sha(logicalText),modelJson:logicalText,
  tables:[{logical:['commerce','Order'],native:physicalTable.table,key:primary[0]!.fields.map((item:any)=>item.element),columns:fields}],
  relationships:[],
  nativeColumns:{target:columnSet.target,sets:[{
   columnSet:{documentId:logical.id,coreVersion:logical.umf,documentSha256:sha(logicalText),module:'commerce',pointer:'/modules/0/extensions/umf.access/columns/0'},
   binding:{sourceId:'orders-binding',documentJson:physicalText,documentSha256:sha(physicalText)},
  }]},
 };
}else{
 q.projections=[];
 mutateSource(q,d=>{
  const record=d.modules[0]!.elements.find(e=>e.id==='Order')!;
  record.members=(record.members as {module:string;element:string}[]).filter(f=>f.element!=='placedAt');
  const view=d.modules[0]!.extensions['umf.access'].views[0]!;
  view.fields=view.fields.filter(f=>f.field.element!=='placedAt');
 });
}

const pinned=profile();
pinned.id=selected?.id??'umf-access-local-production-replay';
pinned.version=selected?.version??'0.1.0';
pinned.python.version=pins?.python??'3.14.8';
pinned.dependencies=[{distribution:'umf_access',version:selected?.runtimeAbi.version??'0.1.0.dev10'},...Object.entries(selected?.runtimeDependencies??{pydantic:'2.14.1'}).map(([distribution,version])=>({distribution,version:String(version)}))];
pinned.vocabularies=selectedPath?[{id:'umf.access',version:'0.1.0'},{id:'umf.binding',version:'0.2.0'}]:pinned.vocabularies;
pinned.assertionKinds=selectedPath?['kind','nullability','Key','facets','umf.access']:pinned.assertionKinds;
pinned.reservedNames=selectedPath?[]:pinned.reservedNames;
pinned.compilerVersion=selected?'local-access-identity-'+selected.id:'test';
pinned.subset=selectedPath
 ?'Selected Linux311 generated commerce OrderIdentity source, actual Weft compiler, and inert Access catalog identity/load only; checker pins are metadata and no checker result is claimed'
 :'Local prerelease packaging replay; no publication or native qualification';
if(selected){
 const profileModule=new URL('../tests/compilation/access-fixtures.ts',import.meta.url);
 pinned.codeSha256=createHash('sha256').update(await readFile(profileModule)).digest('hex');
 pinned.checkers=[
  {name:'mypy',version:selected.checkers.mypy,configuration:{check_untyped_defs:true,python_version:'3.11'}},
  {name:'pyright',version:selected.checkers.pyright,configuration:{typeCheckingMode:'strict',pythonVersion:'3.11',environment:'selected Linux311 profile; checker execution excluded'}},
  {name:'ty',version:selected.checkers.ty,configuration:{pythonVersion:'3.11',environment:'selected Linux311 profile; checker execution excluded'}},
 ];
 const compilerSources=Object.fromEntries(await Promise.all(
  [...new Bun.Glob('src/**/*.ts').scanSync({cwd:process.cwd(),onlyFiles:true})]
   .sort().map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')]),
 ));
 pinned.compilerVersion='local-access-generator-'+createHash('sha256').update(JSON.stringify(compilerSources)).digest('hex');
}
q.profileId=pinned.id;q.profileVersion=pinned.version;
const result=generateAccessPackage(q,pinned);
if(result.outcome!=='candidate')throw new Error(JSON.stringify(result.diagnostics));
await mkdir(destination,{recursive:true});
for(const file of result.files){const target=join(destination,file.path);await mkdir(dirname(target),{recursive:true});await writeFile(target,file.text);}
await writeFile(join(destination,'request.json'),JSON.stringify(q));
await writeFile(join(destination,'profile.json'),JSON.stringify(pinned));
await writeFile(join(destination,'result.json'),JSON.stringify(result));
if(readBinding)await writeFile(join(destination,'binding.json'),JSON.stringify(readBinding));

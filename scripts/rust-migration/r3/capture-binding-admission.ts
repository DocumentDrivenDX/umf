// SPDX-License-Identifier: MIT OR Apache-2.0
/** Freeze complete source results for the reached binding registry and raw profile. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {generateAccessPackage} from '../../../src/compilation';
const root=resolve(import.meta.dir,'../../..'),out=resolve(root,'docs/helix/04-build/evidence/rust-migration/r3/binding-admission-review');
try{await readFile(resolve(out,'frozen.json'));throw Error('Refusing to overwrite binding admission controls');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const baseline=JSON.parse(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r3/baseline/stage-one.json'),'utf8'));
const base=baseline.vectors.find((v:{id:string})=>v.id==='candidate-base').request;
const logical=JSON.parse(await readFile(resolve(root,'fixtures/access/commerce/postgresql18.json'),'utf8'));
const binding=JSON.parse(await readFile(resolve(root,'fixtures/access/commerce/postgresql18-binding.json'),'utf8'));
const edits:[string,(d:any,b:any,q:any)=>void][]=[
 ['stable-postgresql',()=>{}],
 ['legacy-postgresql',(d,b)=>{b.vocabularies['umf.binding'].version='0.1.0';b.extensions['umf.binding'].profile='umf-binding-1';}],
 ['stable-lakebase',(d,b)=>{raw(d,b);}],
 ['unknown-binding-key',(d,b)=>{b.extensions['umf.binding'].future={preserved:['opaque']};}],
 ['missing-logical-field',(d,b)=>{b.extensions['umf.binding'].fields[0].element='missing';}],
 ['duplicate-assignment',(d,b)=>{b.extensions['umf.binding'].fields.push(structuredClone(b.extensions['umf.binding'].fields[0]));}],
 ['version-three',(d,b)=>{b.vocabularies['umf.binding'].version='0.3.0';b.extensions['umf.binding'].profile='umf-binding-3';}],
 ['malformed-binding-schema',(d,b)=>{b.extensions['umf.binding'].target.version=18;}],
 ['relationship-identity',(d,b)=>{b.extensions['umf.binding'].relationships=[{module:'commerce',id:'absent',storage:'foreign_key'}];}],
 ['missing-supplied-binding',(d,b,q)=>{q.bindings=['absent'];}],
 ['raw-target-identity',(d,b)=>{raw(d,b);b.extensions['umf.binding'].target.version='17';}],
 ['raw-column-collision',(d,b)=>{raw(d,b);b.extensions['umf.binding'].fields[1].column=b.extensions['umf.binding'].fields[0].column;}],
];
function raw(d:any,b:any){const access=d.modules[0].extensions['umf.access'];access.columns[0].target.platform='lakebase';b.extensions['umf.binding'].target.system='lakebase';b.extensions['umf.binding'].target.subset='typed-access-columns/0.1';const placed=d.modules[0].elements.find((f:any)=>f.id==='placedAt');placed.scalarType='string';delete placed.facets;for(const view of access.views)for(const f of view.fields)if(f.field.element==='placedAt')delete f.temporal;for(const column of access.columns[0].columns)if(column.field.element==='placedAt')column.type='text';}
const cases:any[]=[];
for(const [id,edit]of edits){const input=structuredClone(base),d=structuredClone(logical),b=structuredClone(binding);input.request.bindings=['orders-binding'];input.request.sources=[{id:'logical',format:'json',text:''},{id:'orders-binding',format:'json',text:''}];edit(d,b,input.request);input.request.sources[0].text=JSON.stringify(d);input.request.sources[1].text=JSON.stringify(b);let expected:any;try{expected={ok:true,result:generateAccessPackage(input.request,input.profile)};}catch(error){const e=error as{code?:string;pointer?:string;message?:string};expected={ok:false,error:{code:e.code??'GENERATION_FAILED',message:e.message??String(error),...(e.pointer===undefined?{}:{pointer:e.pointer})}};}cases.push({id:'binding-'+id,operation:'generateAccessPackage',request:input,expected});}
for(const c of cases.slice(0,3))if(c.expected.result?.outcome!=='candidate')throw Error('Positive binding case did not produce a source candidate: '+c.id+' '+JSON.stringify(c.expected.result?.diagnostics??c.expected));
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const json=JSON.stringify({format:'umf-r3-binding-admission-cases/1',cases},null,2)+'\n';await mkdir(out,{recursive:true});await writeFile(resolve(out,'frozen.json'),json);
const config={entrypoints:['scripts/rust-migration/r3/capture-binding-admission.ts'],target:'bun' as const,write:false,metafile:true};const build=await Bun.build(config);if(!build.success||!build.metafile)throw Error('No capture source closure');
const sources=[];for(const path of Object.keys(build.metafile.inputs).sort())sources.push({path,sha256:sha(await readFile(resolve(root,path)))});
await writeFile(resolve(out,'receipt.json'),JSON.stringify({scope:'Complete original TypeScript binding admission results, positive PostgreSQL 0.1/0.2 and declarative Lakebase plus schema, semantic, correspondence and raw-profile controls. No native Lakebase execution claim.',bun:Bun.version,cases:cases.length,fixtureSha256:sha(json),sourceFiles:sources,inputs:['fixtures/access/commerce/postgresql18.json','fixtures/access/commerce/postgresql18-binding.json'].map(path=>({path}))},null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,fixtureSha256:sha(json),outcomes:cases.map(c=>({id:c.id,outcome:c.expected.result?.outcome??c.expected.error?.code}))}));

// SPDX-License-Identifier: MIT OR Apache-2.0
/** Freeze target naming/relevance/projection controls before their native implementation. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {generateAccessPackage} from '../../../src/compilation';
const root=resolve(import.meta.dir,'../../..'),out=resolve(root,'docs/helix/04-build/evidence/rust-migration/r3/target-admission-review');
try{await readFile(resolve(out,'frozen.json'));throw Error('Refusing to overwrite target admission controls');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
const baseline=JSON.parse(await readFile(resolve(root,'docs/helix/04-build/evidence/rust-migration/r3/baseline/stage-one.json'),'utf8'));
const base=baseline.vectors.find((v:{id:string})=>v.id==='candidate-base').request;
const ref=(element:string)=>({module:'commerce',element});
const field=(python:string,pointer='/modules/0/elements/0')=>({sourceId:'logical',pointer,python});
const cases:unknown[]=[];
const edits:[string,(q:any,p:any)=>void][]=[
 ['profile-assertions',(q,p)=>{p.assertionKinds=[];}],
 ['reserved-class',(q,p)=>{p.reservedNames.push('Order');}],
 ['package-module',(q)=>{q.package='decimal';}],
 ['duplicate-overrides',(q)=>{q.names=[field('one'),field('two')];}],
 ['unknown-override-pointer',(q)=>{q.names=[field('chosen','/not/here')];}],
 ['keyword-field',(q)=>{q.names=[field('class')];}],
 ['model-prefix-field',(q)=>{q.names=[field('model_value')];}],
 ['validator-prefix-field',(q)=>{q.names=[field('validate_field_foo')];}],
 ['field-name-collision',(q)=>{q.names=[field('memo')];}],
 ['projection-duplicate',(q)=>{q.projections=[{name:'Picked',record:ref('Order'),fields:[ref('orderId'),ref('orderId')]}];}],
 ['projection-empty',(q)=>{q.projections=[{name:'Picked',record:ref('Order'),fields:[]}];}],
 ['projection-unselected',(q)=>{q.projections=[{name:'Picked',record:ref('Customer'),fields:[ref('customerId')]}];}],
 ['projection-name-id',(q)=>{q.projections=[{name:'Picked_Field',record:ref('Order'),fields:[ref('orderId')]}];}],
 ['projection-class-collision',(q)=>{q.projections=[{name:'Order',record:ref('Order'),fields:[ref('orderId')]}];}],
 ['float-refusal',(q)=>{const d=JSON.parse(q.sources[0].text);d.modules[0].elements[2].scalarType='float';d.modules[0].elements[2].facets={};q.sources[0].text=JSON.stringify(d);}],
 ['unknown-selected-annotation',(q)=>{const d=JSON.parse(q.sources[0].text);d.modules[0].elements[5].futureTargetAdmission={retained:true};q.sources[0].text=JSON.stringify(d);}],
];
for(const [id,edit]of edits){const input=structuredClone(base);edit(input.request,input.profile);let expected:unknown;try{expected={ok:true,result:generateAccessPackage(input.request,input.profile)};}catch(error){const e=error as{code?:string;pointer?:string;message?:string};expected={ok:false,error:{code:e.code??'GENERATION_FAILED',message:e.message??String(error),...(e.pointer===undefined?{}:{pointer:e.pointer})}};}cases.push({id:'target-'+id,operation:'generateAccessPackage',request:input,expected});}
const sha=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const json=JSON.stringify({format:'umf-r3-target-admission-cases/1',cases},null,2)+'\n';await mkdir(out,{recursive:true});await writeFile(resolve(out,'frozen.json'),json);
const config={entrypoints:['scripts/rust-migration/r3/capture-target-admission.ts'],target:'bun' as const,write:false,metafile:true};const build=await Bun.build(config);if(!build.success||!build.metafile)throw Error('No source closure');
const sources=[];for(const path of Object.keys(build.metafile.inputs).sort())sources.push({path,sha256:sha(await readFile(resolve(root,path)))});
await writeFile(resolve(out,'receipt.json'),JSON.stringify({scope:'Original TypeScript target naming, profile assertion, scalar and projection/relevance refusals before native target admission port; complete outputs retained',bun:Bun.version,cases:cases.length,fixtureSha256:sha(json),sourceFiles:sources},null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,fixtureSha256:sha(json)}));

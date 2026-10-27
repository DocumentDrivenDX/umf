// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze operation-sized inputs and predecessor results for the installed R8 replay.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {relationshipCandidate} from '../../core-relationship-cases';
import {relationshipOperationCases} from '../../core-relationship-operation-cases';
import {declareCoreRelationship,inspectCoreRelationships,lookupCoreRelationship,verifyCoreRelationshipOperation} from '../../../src/model/relationships';

const dir='docs/helix/04-build/evidence/rust-migration/r8-relationships-default-retirement-replay';
const predecessor=JSON.parse(await readFile('docs/helix/04-build/evidence/rust-migration/r8-core-relationships-default-boundary/predecessor.json','utf8'));
const expectedById=new Map(predecessor.cases.map((item:any)=>[item.id,item]));
const row=relationshipOperationCases()[0]!;
const source=relationshipCandidate();
const receipt=declareCoreRelationship(row.source,row.identity,row.request);
const operations=[
 {exportName:'inspectCoreRelationships',rustOwner:'umf_core::core_relationships::inspect_core_relationships',invalid:'inspect.source-before-identity',input:{valid:{source,identity:{module:'m'}},preflight:{profile:'source-accessor',source,identity:{module:'m'}}},run:(x:any)=>inspectCoreRelationships(x.source,x.identity)},
 {exportName:'lookupCoreRelationship',rustOwner:'umf_core::core_relationships::lookup_core_relationship',invalid:'lookup.identity-before-source',input:{valid:{source,identity:{module:'m',id:'order-customer'}},preflight:{profile:'identity-accessor',source,identity:{module:'m',id:'order-customer'}}},run:(x:any)=>lookupCoreRelationship(x.source,x.identity)},
 {exportName:'declareCoreRelationship',rustOwner:'umf_core::core_relationships::declare_core_relationship',invalid:'declare.request-before-source',input:{valid:{source:row.source,identity:row.identity,request:row.request},preflight:{profile:'request-accessor',source:row.source,identity:row.identity,request:row.request}},run:(x:any)=>declareCoreRelationship(x.source,x.identity,x.request)},
 {exportName:'verifyCoreRelationshipOperation',rustOwner:'umf_core::core_relationships::verify_core_relationship_operation',invalid:'verify.receipt-before-current',input:{valid:{receipt,current:receipt.target},preflight:{profile:'receipt-accessor',receipt,current:receipt.target}},run:(x:any)=>verifyCoreRelationshipOperation(x.receipt,x.current)},
];
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const outcome=(run:()=>unknown)=>{try{return stable({status:'returned',value:run()});}catch(e){const x=e as any;return {status:'threw',name:String(x?.name??''),code:typeof x?.code==='string'?x.code:null,path:typeof x?.path==='string'?x.path:null,message:String(x?.message??'')};}};
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
for(const op of operations){
 const old=expectedById.get(op.invalid) as any;
 if(!old)throw new Error(`Missing frozen predecessor case ${op.invalid}`);
 const cases=[
  {id:`${op.exportName}.valid`,input:op.input.valid,expectedOutcome:outcome(()=>op.run(op.input.valid)),expectedTrace:[],expectsRust:true},
  {id:op.invalid,input:op.input.preflight,expectedOutcome:old.outcome,expectedTrace:old.trace,expectsRust:false},
 ];
 const packet={format:'umf.r8.default-route-retirement-packet/1',contractId:'CONTRACT-041',exportName:op.exportName,rustOwner:op.rustOwner,cases};
 const path=`${dir}/${op.exportName}.packet.json`;
 if(process.argv.includes('--check')){
  const actual=await readFile(path,'utf8');
  const wanted=JSON.stringify(packet,null,2)+'\n';
  if(actual!==wanted)throw new Error(`${path} changed; review and explicitly refresh the packet`);
  console.log(JSON.stringify({path,sha256:digest(actual),caseCount:cases.length,mode:'check'}));
 }else{
  const body=JSON.stringify(packet,null,2)+'\n';
  await writeFile(path,body);
  console.log(JSON.stringify({path,sha256:digest(body),caseCount:cases.length,mode:'write'}));
 }
}

// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze a narrow installed replay packet against the reviewed Inspector predecessor.
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {inspectCoreScalarType} from '../../../src/model/scalar-type';
import {inspectCoreRecordMembers} from '../../../src/model/record-members';
import {inspectCoreReferenceLinks} from '../../../src/model/reference-links';

const dir='docs/helix/04-build/evidence/rust-migration/r8-inspectors-default-retirement-replay';
const frozenPath='docs/helix/04-build/evidence/rust-migration/r5-core-inspectors-default/frozen-predecessors.json';
const hostPath='docs/helix/04-build/evidence/rust-migration/r8-core-inspectors-installed/current-5e7138383-20261026/core-inspectors-host-node-bun.json';
const frozen=JSON.parse(await readFile(frozenPath,'utf8'));
const host=JSON.parse(await readFile(hostPath,'utf8'));
await mkdir(dir,{recursive:true});
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const frozenBytes=await readFile(frozenPath),hostBytes=await readFile(hostPath);
if(digest(frozenBytes)!=='9563378b9fb00b213f76d6c0d09ac0c8278c0fb829c719b566b019971a0f3a7a')throw new Error('Frozen Inspector predecessor container changed');
if(digest(hostBytes)!=='37272801887c154c84d37838a275191db82f418b254a284f58184ebdbc217c35')throw new Error('Historical Inspector host-shape receipt changed');
const stable=(value:any):any=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const outcome=(run:()=>unknown)=>{try{return stable({status:'returned',value:run()});}catch(error){const e=error as any;return {status:'threw',name:String(e?.name??''),code:typeof e?.code==='string'?e.code:null,path:typeof e?.path==='string'?e.path:null,message:String(e?.message??'')};}};
const fromFrozen=(value:any)=>value.ok?stable({status:'returned',value:value.value}):{status:'threw',name:value.error?.name??'UmfError',code:value.error?.code??null,path:value.error?.path??null,message:value.error?.message??''};
const operations=[
 {key:'scalarType',exportName:'inspectCoreScalarType',rustOwner:'umf_core::scalar_type_inspection::inspect_core_scalar_type',validCase:'known_uuid',preflight:'accessor_source',run:inspectCoreScalarType},
 {key:'recordMembers',exportName:'inspectCoreRecordMembers',rustOwner:'umf_core::record_members_inspection::inspect_core_record_members',validCase:'known',preflight:'accessor_identity',run:inspectCoreRecordMembers},
 {key:'referenceLinks',exportName:'inspectCoreReferenceLinks',rustOwner:'umf_core::reference_links_inspection::inspect_core_reference_links',validCase:'known',preflight:'accessor_source',run:inspectCoreReferenceLinks},
];
const hostKind=(key:string,preflight:string)=>key==='scalarType'?'scalarType':key==='recordMembers'?'recordMembers':'referenceLinks';
for(const op of operations){
 const packet=frozen.packets[op.key].packet;
 const validInput=packet.cases[op.validCase];
 const validExpected=fromFrozen(packet.outcomes[op.validCase]);
 const validActual=outcome(()=>op.run(validInput.source,validInput.identity));
 if(JSON.stringify(validActual)!==JSON.stringify(validExpected))throw new Error(`${op.exportName}/${op.validCase} no longer matches frozen TypeScript predecessor`);
 const hostCase=host.runtime.node.hostShapes[hostKind(op.key,op.preflight)][op.preflight].default;
 const preflightExpected={status:'threw',name:hostCase.error.name,code:hostCase.error.code,path:hostCase.error.path,message:hostCase.error.message};
 const input={source:validInput.source,identity:validInput.identity,profile:op.preflight};
 const sourceForPreflight=structuredClone(input.source),identityForPreflight=structuredClone(input.identity);
 let getterCalls=0;
 if(op.preflight==='accessor_source')Object.defineProperty(sourceForPreflight,'probe',{enumerable:true,get(){getterCalls++;return null;}});
 else Object.defineProperty(identityForPreflight,'module',{enumerable:true,get(){getterCalls++;return null;}});
 const preflightActual=outcome(()=>op.run(sourceForPreflight,identityForPreflight));
 if(JSON.stringify(stable(preflightActual))!==JSON.stringify(stable(preflightExpected))||getterCalls!==0)throw new Error(`${op.exportName}/${op.preflight} no longer matches the frozen host-boundary predecessor`);
 const cases=[
  {id:`${op.exportName}.${op.validCase}`,input:{source:validInput.source,identity:validInput.identity},expectedOutcome:validExpected,expectedTrace:[],expectsRust:true},
  {id:`${op.exportName}.${op.preflight}`,input,expectedOutcome:preflightExpected,expectedTrace:[],expectsRust:false},
 ];
 const body={format:'umf.r8.default-route-retirement-packet/1',contractId:'CONTRACT-040',exportName:op.exportName,rustOwner:op.rustOwner,cases};
 const path=`${dir}/${op.exportName}.packet.json`;
 if(process.argv.includes('--check')){const actual=await readFile(path,'utf8');const expected=JSON.stringify(body,null,2)+'\n';if(actual!==expected)throw new Error(`${path} changed; review and explicitly refresh the packet`);console.log(JSON.stringify({path,sha256:digest(actual),caseCount:cases.length,mode:'check'}));}
 else{const encoded=JSON.stringify(body,null,2)+'\n';await writeFile(path,encoded);console.log(JSON.stringify({path,sha256:digest(encoded),caseCount:cases.length,mode:'write'}));}
}

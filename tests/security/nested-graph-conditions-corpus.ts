// SPDX-License-Identifier: MIT OR Apache-2.0
/** @covers US-056-AC2 @covers US-056-AC6 @covers US-056-AC10
 * Supplied complete graph semantics only; no native authority or backend promotion. */
import vectors from './nested-graph-condition-vectors.json';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogReadDisclosureBatch as produce} from '../../src/extensions/security/catalog-runtime-candidate';
import {inspectSecurityDisclosureV2} from '../../src/extensions/security/protection/disclosure';
import {securityAnd,securityOr} from '../../src/extensions/security/logic';
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function runNestedGraphConditionsCorpus(){
 const checks:{id:string;passed:boolean}[]=[],check=(id:string,actual:unknown,expected:unknown)=>checks.push({id,passed:equal(actual,expected)});
 const initial=vectors.initialize as any,s=initial.sources;
 const program=compileCandidateCatalogProgram(s.policy,s.catalog,s.closure,s.ontology,s.associationBindings);
 for(const packet of vectors.packets){
  const result=produce(program,initial.owner,packet.cut,initial.selection);
  check(packet.id+'-rendered',result.status,'rendered');check(packet.id+'-data-only',[result.complete,result.authority],[false,false]);
  check(packet.id+'-independent-keys',result.resources.map((r:any)=>r.key[0].string),packet.expectedKeys);
  check(packet.id+'-exact-original-cells',result.batch?.rows,packet.expectedKeys.map(key=>[{disposition:'original',value:{string:key}},{disposition:'original',value:{integerToken:({RA:'100',RB:'200',RO:'300'} as any)[key]}}]));
  check(packet.id+'-original-codec',inspectSecurityDisclosureV2(result.batch,s.policy,s.catalog,s.closure).status,'validated-disclosure');
 }
 // False/true branch absorption must never suppress the global preflight.
 const base=vectors.packets.find(p=>p.id==='base:Outsider')!;
 for(const defect of ['graph-coverage','graph-role','field-coverage','field-value','endpoint-population']){
  const cut:any=structuredClone(base.cut);
  if(defect==='graph-coverage')cut.graphCoverage=cut.graphCoverage.filter((c:any)=>c.relationship.relationshipId!=='OwnershipProject');
  if(defect==='graph-role')cut.graphCoverage.find((c:any)=>c.relationship.relationshipId==='StaffAssignment').roles=[];
  if(defect==='field-coverage')cut.coverage.find((c:any)=>c.type.elementId==='Assignment').fields=cut.coverage.find((c:any)=>c.type.elementId==='Assignment').fields.filter((f:any)=>f.elementId!=='active');
  if(defect==='field-value')cut.facts.find((f:any)=>f.type.elementId==='Assignment').fields=cut.facts.find((f:any)=>f.type.elementId==='Assignment').fields.filter((f:any)=>f.field.elementId!=='active');
  if(defect==='endpoint-population')cut.facts=cut.facts.filter((f:any)=>!(f.type.elementId==='Assignment'&&f.key[0].string==='AA'));
  const result=produce(program,initial.owner,cut,initial.selection);check('preflight-'+defect,result,{version:'umf.security.logical-disclosure-batch/0.1-candidate',status:'refused',complete:false,authority:false,sources:null,decisions:[],resources:[],batch:null});
 }
 // Original truth tables include U; U is never an absorbing value.
 for(const a of ['F','U','T'] as const)for(const b of ['F','U','T'] as const){
  check('truth-and-'+a+b,securityAnd([a,b]),a==='F'||b==='F'?'F':a==='U'||b==='U'?'U':'T');
  check('truth-or-'+a+b,securityOr([a,b]),a==='T'||b==='T'?'T':a==='U'||b==='U'?'U':'F');
 }
 return checks;
}

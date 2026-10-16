/** Exhaustive finite original-kernel composition, not native permission. */
import source from './protection/query-value-route-guards.json';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateQueryValueRoutes} from '../../src/extensions/security/query-value-route-evaluation-candidate';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
export function runQueryValueThreeValuedCorpus(){
 const summary={states:0,permutations:2,truthVectors:6561,unknown:0,deny:0,permit:0,selections:{} as Record<string,number>};
 for(const reverse of [false,true]){
  const f:any=structuredClone(source),elements=f.closure.documents[0].document.modules[0].elements;
  const entity=f.ontology.entities.find((e:any)=>e.type.elementId==='Resource'),record=elements.find((e:any)=>e.id==='Resource');
  const resource=f.logicalCut.facts.find((e:any)=>e.type.elementId==='Resource'),coverage=f.logicalCut.coverage.find((e:any)=>e.type.elementId==='Resource');
  for(let i=6;i<8;i++){const descriptor=structuredClone(elements.find((e:any)=>e.id==='guard0'));descriptor.id='guard'+i;descriptor.name='Guard '+i;elements.push(descriptor);}
  for(let i=0;i<8;i++){const field=ref('guard'+i);elements.find((e:any)=>e.id==='guard'+i).nullability='absent-allowed';record.members.push({module:'m',element:'guard'+i});entity.fields.push({ref:field,protection:'unprotected'});coverage.fields.push(field);f.owner.storage.push({type:ref('Resource'),field,storageEffect:'canonical'});}
  for(const [id,effect,i] of [['forbid-extra','forbid',6],['require-extra','require',7]] as const)f.policy.rules.push({id,effect,actions:['read'],target:[ref('Resource')],condition:{op:'eq',left:{kind:'resource',field:ref('guard'+i)},right:{kind:'constant',field:ref('guard'+i),value:{boolean:true}}}});
  for(const rule of f.policy.rules)if(rule.condition.op==='eq'&&rule.condition.left.kind==='context')rule.condition.left.kind='resource';
  if(reverse)f.policy.rules.reverse();
  const program=compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology),base=structuredClone(resource.fields);
  for(let n=0;n<6561;n++){
   let remainder=n;const states=Array.from({length:8},()=>{const t=remainder%3;remainder=Math.floor(remainder/3);return t;});
   resource.fields=structuredClone(base);resource.absent=[];
   for(let i=0;i<8;i++)if(states[i]===2)resource.absent.push(ref('guard'+i));else resource.fields.push({field:ref('guard'+i),value:{boolean:states[i]===1}});
   // Independent oracle over authored effects: every unknown fails closed;
   // require must hold, forbid must not hold, at least one permit must hold.
   const expectedDecision=states.includes(2)?'indeterminate':states[6]===1||states[7]!==1||!states.slice(0,6).includes(1)?'deny':'permit';
   const a=states[0]===1||states[1]===1,b=states[2]===1,w=states[4]===1;
   const expectedRoute=w?'withheld':a&&b?'conflict':a?'mask-A':b?'mask-B':states[3]===1?'original':'missing';
   const actual=evaluateCandidateQueryValueRoutes(program,f.owner,f.logicalCut,{scan:'s0',path:'filters/0/left',type:ref('Resource'),field:ref('salary'),operator:'predicate',operation:'equal',required:['equality']});
   const row=actual.rows[0],expectedSelection=expectedDecision==='indeterminate'?'read-indeterminate':expectedDecision==='deny'?'read-denied':expectedRoute==='conflict'?'disclosure-conflict':'selected';
   const expectedTruth=f.policy.rules.map((r:any)=>{const name=r.condition.left?.field?.elementId;return name?.startsWith('guard')?['F','T','U'][states[Number(name.slice(5))]!] :'T';});
   const branchLabels=row?.activeBranches.map(i=>{const branch:any=actual.plan!.branches[i];return branch.projection.kind==='transformed'?(branch.representativeDisposition.transform==='salary-label'?'mask-A':'mask-B'):branch.projection.kind==='unresolved-missing-disclosure'?'missing':branch.projection.kind;});
   const expectedBranches=expectedSelection==='selected'?[expectedRoute]:[];
   if(actual.status!=='evaluated'||actual.authority!==false||actual.complete!==false||actual.rows.length!==1||JSON.stringify(row?.resource)!==JSON.stringify({type:resource.type,key:resource.key})||JSON.stringify(row?.rules.map((r:any)=>r.ruleIndex))!==JSON.stringify(f.policy.rules.map((_:any,i:number)=>i))||row?.readDecision!==expectedDecision||row.selection!==expectedSelection||JSON.stringify(row.rules.map((r:any)=>r.truth))!==JSON.stringify(expectedTruth)||JSON.stringify(branchLabels)!==JSON.stringify(expectedBranches))throw Error(JSON.stringify({reverse,n,states,expectedDecision,expectedSelection,expectedBranches,actual}));
   summary.states++;summary[expectedDecision==='indeterminate'?'unknown':expectedDecision]++;summary.selections[expectedSelection]=(summary.selections[expectedSelection]??0)+1;
  }
 }
 return summary;
}

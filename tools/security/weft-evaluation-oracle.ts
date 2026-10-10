// Pure cross-language logical oracle; no authenticated native fact provider.
import {evaluationFixture} from '../../tests/security/evaluation-fixture';
import {ref} from '../../tests/security/fixture';
import {evaluateSecurityCollection} from '../../src/extensions/security/evaluate';
const cases=[];
for(const name of ['valid','inactive','missing','sibling','other-staff','ownerless','trust','generation','policy','subject','ambiguous','coverage','attribute','duplicate','budget','empty-complete','empty-incomplete','unknown-branch','invalid-action-empty','original-missing'] as const){
 const f=evaluationFixture();const request={action:'read',resources:[f.resource],output:[ref('salary')],targets:[ref('Resource')]};
 if(name==='inactive')f.assignment.fields.find(v=>v.field.elementId==='active')!.value={boolean:false};
 if(name==='missing')f.cut.facts=[f.owner];
 if(name==='ownerless')f.cut.facts=[f.assignment];
 if(name==='sibling')f.assignment.fields.find(v=>v.field.elementId==='assignmentProject')!.value={string:'p2'};
 if(name==='other-staff')f.assignment.fields.find(v=>v.field.elementId==='assignmentStaff')!.value={string:'bob'};
 if(name==='trust')f.cut.trusted=false;
 if(name==='generation')f.cut.generation='g2';
 if(name==='policy')f.cut.policyRevision='old';
 if(name==='subject')f.cut.subjects=[];
 if(name==='ambiguous')f.cut.subjects.push(f.cut.subjects[0]!);
 if(name==='coverage'||name==='empty-incomplete')f.cut.coverage.find(c=>c.type.elementId==='Assignment')!.complete=false;
 if(name==='attribute')f.assignment.fields=f.assignment.fields.filter(v=>v.field.elementId!=='active');
 if(name==='duplicate')f.cut.facts.push(f.assignment);
 if(name==='budget')f.cut.maxSteps=1;
 if(name==='empty-complete'||name==='empty-incomplete'||name==='invalid-action-empty')request.resources=[];
 if(name==='invalid-action-empty')request.action='unknown';
 if(name==='unknown-branch'){
  f.policy.rules[1]!.condition={op:'and',args:[{op:'literal',value:false},f.policy.rules[1]!.condition]};
  f.cut.coverage.find(c=>c.type.elementId==='Assignment')!.complete=false;
 }
 if(name==='original-missing'){
  request.output=[ref('resourceId')];f.resource.fields=f.resource.fields.filter(v=>v.field.elementId!=='resourceId');
 }
 const result=evaluateSecurityCollection(f.policy,f.resolution,f.cut,request);
 cases.push({name,policy:f.policy,cut:f.cut,request,expected:{status:result.status,rowCount:result.rows.length}});
}
for(const operator of ['predicate','order','group','join','aggregate'] as const){
 for(const variant of ['default-prohibited','empty-prohibited','disclosed-withheld','disclosed-transformed','original-no-action','original-no-grant','original-grant','original-forbid','original-missing-field','empty-original-incomplete','disclosed-original-missing'] as const){
  const f=evaluationFixture(),salary=f.resolution.ontology.entities.find(t=>t.type.elementId==='Resource')!.fields.find(p=>p.ref.elementId==='salary')!;
  let field=ref('salary');
  const query:{field:ReturnType<typeof ref>;operator:typeof operator;originalAction?:string}={field,operator};
  if(variant.startsWith('disclosed-'))salary.queryUse={[operator]:'disclosed'};
  if(variant.startsWith('original-')||variant==='empty-original-incomplete'){
   salary.queryUse={[operator]:'original-authorized'};f.resolution.ontology.actions.push('query-original');
   if(variant!=='original-no-action')query.originalAction='query-original';
   if(!['original-no-action','original-no-grant'].includes(variant))f.policy.rules.push({id:'query-original',effect:'permit',actions:['query-original'],target:[ref('Resource')],condition:{op:'literal',value:true}});
  }
  if(variant==='original-forbid')f.policy.rules.push({id:'original-forbid',effect:'forbid',actions:['query-original'],target:[ref('Resource')],condition:{op:'literal',value:true}});
  if(variant==='original-missing-field')f.resource.fields=f.resource.fields.filter(v=>v.field.elementId!=='salary');
  if(variant==='disclosed-transformed')f.policy.rules[0]!.disclosure![0]!.disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:ref('staffId'),value:{string:'redacted'}};
  if(variant==='disclosed-original-missing'){query.field=ref('resourceId');f.resource.fields=f.resource.fields.filter(v=>v.field.elementId!=='resourceId');}
  if(variant==='empty-original-incomplete'){
   const membership=f.policy.rules[1]!.condition;f.policy.rules[1]!.condition={op:'literal',value:true};
   f.policy.rules.find(r=>r.id==='query-original')!.condition=membership;
   f.cut.coverage.find(c=>c.type.elementId==='Assignment')!.complete=false;
  }
  const request={action:'read',resources:variant.startsWith('empty-')?[]:[f.resource],targets:[ref('Resource')],output:[ref('salary')],queryUses:[query]};
  const result=evaluateSecurityCollection(f.policy,f.resolution,f.cut,request);
  cases.push({name:`query-${operator}-${variant}`,policy:f.policy,ontology:f.resolution.ontology,cut:f.cut,request,expected:{status:result.status,rowCount:result.rows.length}});
 }
}
await Bun.write('/private/tmp/umf-security-weft-evaluation-oracle.json',JSON.stringify({scope:'Bounded pure logical simulation, no native authentication or backend acceptance',cases},null,2)+'\n');
console.log(JSON.stringify({cases:cases.length}));

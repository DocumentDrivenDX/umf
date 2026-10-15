/** Source/authority-path observations only; not a new query compiler or native permit. */
import source from './protection/current-query-source.json';
import scenarios from './protection/current-query-read-scenarios.json';
import modesSource from './protection/query-value-modes-source.json';
import {evaluationFixture} from './evaluation-fixture';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogScanBatch,evaluateCandidateCatalogAction} from '../../src/extensions/security/catalog-runtime-candidate';
import {inspectProtectionQueryProperties} from '../../src/extensions/security/protection/queries';
import {inspectCandidateStoredQueryProperties} from '../../src/extensions/security/stored-query-candidate';
import {evaluateSecurityAccess} from '../../src/extensions/security/evaluate';
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
export function runQueryValueSourceCorpus(){
 const rows:{id:string;expected:unknown;observed:unknown;passed:boolean}[]=[];
 const check=(id:string,expected:unknown,observed:unknown)=>rows.push({id,expected,observed,passed:JSON.stringify(expected)===JSON.stringify(observed)});
 const original=JSON.stringify({source,scenarios});
 const entity=source.ontology.entities.find(e=>e.type.elementId==='Resource')!,field:any=entity.fields.find(f=>f.ref.elementId==='token')!,stored:any=source.owner.storage.find(s=>s.type.elementId==='Resource'&&s.field.elementId==='token')!,transform=source.catalog.transforms.find(t=>t.id===stored.storageTransform.id&&t.version===stored.storageTransform.version)!;
 const elements=source.closure.documents[0]!.document.modules[0]!.elements,token:any=elements.find(e=>e.id==='token'),input:any=elements.find(e=>e.id===transform.inputDomain.elementId),record:any=elements.find(e=>e.id==='Resource');
 check('stored-live-and-pre-input-domains',['string','integer','token','clear',false],[token.scalarType,input.scalarType,transform.outputDomain.elementId,transform.inputDomain.elementId,record.members.some((m:any)=>m.element===input.id)]);
 check('original-source-no-query-original-action',false,source.ontology.actionPurposes.some(a=>a.purposes.some(p=>String(p)==='original-authorized')));
 for(const variant of ['r1','r2']){
  const policy:any=structuredClone(variant==='r1'?source.policy:scenarios.policy),owner:any=structuredClone(source.owner),cut:any=structuredClone(scenarios.cut);owner.revision='query-value-probe-owner-r1';owner.disclosure={readAction:'read'};cut.owner.revision=owner.revision;cut.policy.revision=policy.revision;
  const p=compileCandidateCatalogProgram(policy,source.catalog,source.closure,source.ontology),batch=evaluateCandidateCatalogScanBatch(p,owner,cut,[{scan:'s0',type:ref('Resource'),fields:[ref('token')]}]);
  check(variant+':row-read-status',variant==='r1'?'refused':'rendered',batch.status);
  if(variant==='r2')check('r2:original-is-opaque-token',{field:ref('token'),disposition:'original',value:{string:'opaque-token'}},batch.scans[0]!.rows[0]![0]);
  for(const operator of ['predicate','order','group','join','aggregate'] as const){
   const mode=field.queryUse?.[operator]??(field.protection==='protected'?'prohibited':'disclosed'),catalogMode=transform.queryUse[operator];
   const property=inspectCandidateStoredQueryProperties(p,owner,{type:ref('Resource'),field:ref('token'),operator,required:[operator==='order'?'order':'equality']});
   check(variant+':'+operator+':independent-source-modes',['prohibited','disclosed'],[mode,catalogMode]);
   check(variant+':'+operator+':conditional-properties',operator==='order'?'refused':'compatible-properties',property.report?.status);
   check(variant+':'+operator+':source-mode-conjunction',false,mode===catalogMode&&mode!=='prohibited');
  }
 }
 // Explicit new canonical source positive; no declarations are inserted into r1/r2.
 const modes:any=structuredClone(modesSource),mp=compileCandidateCatalogProgram(modes.policy,modes.catalog,modes.closure,modes.ontology),selection=[{scan:'s0',type:ref('Resource'),fields:[ref('salary'),ref('token')]}];
 const render=(f:any,p:any=compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology))=>evaluateCandidateCatalogScanBatch(p,f.owner,f.logicalCut,selection);
 const action=(f:any,name:string,p:any=compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology),empty=false)=>evaluateCandidateCatalogAction(p,f.owner,f.logicalCut,{action:name,targets:[ref('Resource')],resources:empty?[]:[{type:ref('Resource'),key:[{string:'r1'}]}],fields:[]});
 check('new-source:masked-projection-and-stored-original',[[{field:ref('salary'),disposition:'transformed',outputType:ref('salaryMaskLabel'),value:{string:'[private]'}},{field:ref('token'),disposition:'original',value:{string:'opaque-token'}}]],render(modes,mp).scans[0]!.rows);
 const me=modes.ontology.entities.find((e:any)=>e.type.elementId==='Resource'),mt=modes.catalog.transforms[0];
 for(const operator of ['predicate','order','group','join','aggregate'] as const){
  const mode=operator==='order'?'original-authorized':'disclosed';check('new-source:'+operator+':matching-modes',[mode,mode],[me.fields.find((f:any)=>f.ref.elementId==='token').queryUse[operator],mt.queryUse[operator]]);
  const p=inspectCandidateStoredQueryProperties(mp,modes.owner,{type:ref('Resource'),field:ref('token'),operator,required:[operator==='order'?'order':'equality']});check('new-source:'+operator+':conditional-capability',operator==='order'?'requires-original-action':'compatible-properties',p.report?.status);
 }
 check('new-source:salary-catalog-original-query-route','requires-original-action',inspectProtectionQueryProperties(modes.policy,modes.catalog,modes.closure,{ruleIndex:0,disclosureIndex:0,operator:'predicate',required:['equality']}).status);
 check('new-source:salary-order-prohibited','prohibited',inspectProtectionQueryProperties(modes.policy,modes.catalog,modes.closure,{ruleIndex:0,disclosureIndex:0,operator:'order',required:['order']}).status);
 for(const intent of modes.intendedOriginalActions){
  check('new-source:'+intent.operator+':exact-purpose',true,modes.ontology.actionPurposes.some((a:any)=>a.action===intent.action&&JSON.stringify(a.purposes)==='["original-authorized"]')&&!['read','reverse','vault-write'].includes(intent.action));
  check('new-source:'+intent.operator+':membership-not-weakened',true,JSON.stringify(modes.policy.rules.find((r:any)=>r.id===intent.action+'-membership').condition)===JSON.stringify(modes.policy.rules.find((r:any)=>r.id==='membership').condition));
  check('new-source:'+intent.operator+':permitted-action',['permit'],action(modes,intent.action,mp).rows.map(r=>r.decision));
  const inactive:any=structuredClone(modes);inactive.logicalCut.facts.find((r:any)=>r.type.elementId==='Assignment').fields.find((v:any)=>v.field.elementId==='active').value={boolean:false};check('new-source:'+intent.operator+':inactive-denies',['deny'],action(inactive,intent.action).rows.map(r=>r.decision));
  const missing:any=structuredClone(modes);missing.policy.revision+='-without-'+intent.operator;missing.logicalCut.policy.revision=missing.policy.revision;missing.policy.rules=missing.policy.rules.filter((r:any)=>r.id!==intent.action+'-permit');check('new-source:'+intent.operator+':read-does-not-supply-original-grant',['deny'],action(missing,intent.action).rows.map(r=>r.decision));check('new-source:'+intent.operator+':read-mask-still-independent','rendered',render(missing).status);
  const incomplete:any=structuredClone(modes);incomplete.logicalCut.coverage.find((r:any)=>r.type.elementId==='Assignment').fields=[];check('new-source:'+intent.operator+':empty-still-needs-action-dependencies','refused',action(incomplete,intent.action,undefined,true).status);
 }
 const wrongProject:any=structuredClone(modes);const project=structuredClone(wrongProject.logicalCut.facts.find((f:any)=>f.type.elementId==='Project'));project.key=[{string:'p2'}];project.fields[0].value={string:'p2'};wrongProject.logicalCut.facts.push(project);wrongProject.logicalCut.facts.find((f:any)=>f.type.elementId==='Ownership').fields.find((v:any)=>v.field.elementId==='ownerProject').value={string:'p2'};check('new-source:other-project-read-filters',[],render(wrongProject).scans[0]!.rows);
 for(const intent of modes.intendedOriginalActions)check('new-source:'+intent.operator+':other-project-original-denies',['deny'],action(wrongProject,intent.action).rows.map(r=>r.decision));
 check('new-source:storage-input-still-not-live','refused',evaluateCandidateCatalogScanBatch(mp,modes.owner,modes.logicalCut,[{scan:'s0',type:ref('Resource'),fields:[ref('clear')]}]).status);
 // Explicit new legacy diagnostic source; it is not inserted into the named0.2 source.
 const f=evaluationFixture();f.policy.revision='query-value-legacy-policy-r1';f.resolution.ontology.revision='query-value-legacy-ontology-r1';f.policy.ontology.revision=f.resolution.ontology.revision;f.cut.policyRevision=f.policy.revision;f.cut.ontologyRevision=f.resolution.ontology.revision;
 const salary=f.resolution.ontology.entities.find(e=>e.type.elementId==='Resource')!.fields.find(f=>f.ref.elementId==='salary')!;salary.queryUse={predicate:'original-authorized'};f.resolution.ontology.actions.push('query-original');
 const request={action:'read',output:[ref('salary')],queryUses:[{field:ref('salary'),operator:'predicate' as const,originalAction:'query-original'}]};
 check('legacy:no-separate-grant','indeterminate',evaluateSecurityAccess(f.policy,f.resolution,f.cut,request,f.resource).decision);
 f.policy.rules.push({id:'query-original',effect:'permit',actions:['query-original'],target:[ref('Resource')],condition:{op:'literal',value:true}});
 const separate=evaluateSecurityAccess(f.policy,f.resolution,f.cut,request,f.resource);check('legacy:separate-query-still-withholds-output',{decision:'permit',output:[{field:ref('salary'),disposition:'withheld'}]},separate);
 f.policy.rules[0]!.disclosure![0]!.disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:ref('staffId'),value:{string:'redacted'}};
 check('legacy:per-use-original-and-dto-domains',{decision:'permit',output:[{field:ref('salary'),disposition:'transformed',outputType:ref('staffId'),value:{string:'redacted'}}]},evaluateSecurityAccess(f.policy,f.resolution,f.cut,request,f.resource));
 check('legacy:original-field-not-retyped','integer',f.resolution.documents[0]!.document.modules[0]!.elements.find(e=>e.id==='salary')!.scalarType);
 salary.queryUse={predicate:'disclosed'};f.resource.fields=f.resource.fields.filter(v=>v.field.elementId!=='salary');f.resource.absent=[ref('salary')];f.resolution.documents[0]!.document.modules[0]!.elements.find(e=>e.id==='salary')!.nullability='absent-allowed';
 check('legacy:constant-dto-needs-no-invented-live-input',{decision:'permit',output:[{field:ref('salary'),disposition:'transformed',outputType:ref('staffId'),value:{string:'redacted'}}]},evaluateSecurityAccess(f.policy,f.resolution,f.cut,{action:'read',output:[ref('salary')],queryUses:[{field:ref('salary'),operator:'predicate'}]},f.resource));
 salary.queryUse={predicate:'original-authorized'};check('legacy:known-absence-permission-is-not-scalar-lowering','permit',evaluateSecurityAccess(f.policy,f.resolution,f.cut,request,f.resource).decision);
 check('named-sources-unchanged',true,original===JSON.stringify({source,scenarios}));
 return rows;
}

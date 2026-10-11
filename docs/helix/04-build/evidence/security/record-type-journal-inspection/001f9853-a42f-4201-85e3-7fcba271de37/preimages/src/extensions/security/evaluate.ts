import {copyJson} from '../../model/json';
import {encodeCoreKeyTuple,type CoreKeyTupleValue} from '../../model/key-tuple';
import {canonicalSchemaJson,checkSchemaLiteral,literalIdentity,type CoreLiteral} from '../../model/schema-literals';
import type {Element} from '../../model/types';
import {requireSecurityInterpretation} from './policy';
import {securityAnd,securityNot,securityOr,type SecurityTruth,type SecurityDecision} from './logic';
import {securityRefIdentity as id,type SecurityPolicy,type SecurityResolution,type SecurityRef,type SecurityEntity,type SecurityAssociation,type SecurityExpr,type SecurityTerm,type SecurityFieldDisposition,type SecurityQueryOperator} from './types';

export interface SecurityFact {
  type:SecurityRef;key:CoreKeyTupleValue[];
  fields:{field:SecurityRef;value:CoreLiteral}[];
  absent:SecurityRef[];
}
/** Host attestation, not a credential: never construct this from policy or client input. */
export interface SecurityFactCut {
  trusted:boolean;generation:string;expectedGeneration:string;
  policyId:string;policyRevision:string;ontologyDocumentId:string;ontologyRevision:string;
  subjects:SecurityFact[];facts:SecurityFact[];
  coverage:{type:SecurityRef;complete:boolean;fields:SecurityRef[]}[];
  context:{field:SecurityRef;value:CoreLiteral}[];
  maxFacts:number;maxSteps:number;
}
export interface SecurityEvaluationRequest {
  action:string;resources:SecurityFact[];output:SecurityRef[];
  targets?:SecurityRef[];
  queryUses?:{field:SecurityRef;operator:SecurityQueryOperator;originalAction?:string}[];
}
export type SecurityOutput = {field:SecurityRef;disposition:'withheld'|'absent'} |
  {field:SecurityRef;disposition:'original';value:CoreLiteral} |
  {field:SecurityRef;disposition:'transformed';outputType:SecurityRef;value:CoreLiteral};
export interface SecurityAccessResult {decision:SecurityDecision;output:SecurityOutput[]}
export interface SecurityCollectionResult {status:'evaluated'|'refused';rows:SecurityOutput[][]}
class Refusal extends Error {}
const fail=():never=>{throw new Refusal();};
const members=(value:unknown,keys:string[]):Record<string,any>=>{
  if(value===null||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))return fail();
  return value as Record<string,any>;
};
const list=(value:unknown,max=10000):any[]=>Array.isArray(value)&&value.length<=max?value:fail();
const refKey=(value:SecurityRef):string=>{
  const r=members(value,['documentId','moduleId','elementId']);
  if([r.documentId,r.moduleId,r.elementId].some(x=>typeof x!=='string'||!x.length))return fail();return id(value);
};

function evaluator(policyInput:SecurityPolicy,resolutionInput:SecurityResolution,cutInput:SecurityFactCut,requestInput:SecurityEvaluationRequest) {
  const inspected=requireSecurityInterpretation(policyInput,resolutionInput);
  const policy=inspected.source as unknown as SecurityPolicy,resolution=inspected.resolution as unknown as SecurityResolution;
  const cut=copyJson(cutInput) as unknown as SecurityFactCut,request=copyJson(requestInput) as unknown as SecurityEvaluationRequest;
  members(cut,['trusted','generation','expectedGeneration','policyId','policyRevision','ontologyDocumentId','ontologyRevision','subjects','facts','coverage','context','maxFacts','maxSteps']);
  members(request,['action','resources','output','queryUses','targets']);
  if(cut.trusted!==true||typeof cut.generation!=='string'||!cut.generation||cut.generation!==cut.expectedGeneration||
      cut.policyId!==policy.id||cut.policyRevision!==policy.revision||cut.ontologyDocumentId!==resolution.ontology.documentId||cut.ontologyRevision!==resolution.ontology.revision||
      !Number.isSafeInteger(cut.maxFacts)||cut.maxFacts<1||cut.maxFacts>10000||
      !Number.isSafeInteger(cut.maxSteps)||cut.maxSteps<1||cut.maxSteps>1000000||
      !resolution.ontology.actions.includes(request.action))fail();
  list(cut.subjects,1);if(cut.subjects.length!==1)fail();list(cut.facts,cut.maxFacts);list(request.resources,cut.maxFacts);
  if(cut.subjects.length+cut.facts.length+request.resources.length>cut.maxFacts)fail();
  list(cut.coverage,512);list(cut.context,256);list(request.output,4096);list(request.queryUses??[],4096);
  let steps=0;
  const step=()=>{if(++steps>cut.maxSteps)fail();};
  let text=0;
  const boundText=(value:unknown):void=>{
    step();if(typeof value==='string'){text+=value.length;if(text>4000000)fail();}
    else if(value&&typeof value==='object')for(const item of Object.values(value))boundText(item);
  };
  boundText(cut);boundText(request);
  const types=new Map([...resolution.ontology.entities,...resolution.ontology.associations].map(t=>[id(t.type),t]));
  const field=(r:SecurityRef):Element=>{
    const e=resolution.documents.find(d=>d.document.id===r.documentId)?.document.modules.find(m=>m.id===r.moduleId)?.elements.find(e=>e.id===r.elementId);
    if(!e||e.kind!=='field')return fail();return e;
  };
  const document=(r:SecurityRef)=>resolution.documents.find(d=>d.document.id===r.documentId)?.document??fail();
  const identityCache=new Map<SecurityFact,string>();
  const tuple=(type:SecurityEntity,values:CoreKeyTupleValue[]):string=>{step();return encodeCoreKeyTuple(document(type.type),
    {module:type.type.moduleId,element:type.type.elementId,key:type.keyId},values).bytesHex;};
  const identity=(fact:SecurityFact):string=>{
    let value=identityCache.get(fact);if(value!==undefined)return value;
    const type=types.get(refKey(fact.type))??fail();value=canonicalSchemaJson([id(type.type),type.keyId,tuple(type,fact.key)]);
    identityCache.set(fact,value);return value;
  };
  const value=(fact:SecurityFact,r:SecurityRef):CoreLiteral|undefined=>fact.fields.find(f=>id(f.field)===id(r))?.value;
  const keyFields=(type:SecurityEntity):SecurityRef[]=>{
    const record=document(type.type).modules.find(m=>m.id===type.type.moduleId)!.elements.find(e=>e.id===type.type.elementId)!;
    const key=(record.keys as {id:string;fields:{module:string;element:string}[]}[]).find(k=>k.id===type.keyId)!;
    return key.fields.map(f=>({documentId:type.type.documentId,moduleId:f.module,elementId:f.element}));
  };
  const literal=(r:SecurityRef,v:CoreLiteral):string=>{
    checkSchemaLiteral(document(r),field(r),v);return v===null?'null':literalIdentity(field(r),v);
  };
  const validateFact=(fact:SecurityFact)=>{
    step();
    members(fact,['type','key','fields','absent']);const type=types.get(refKey(fact.type))??fail();list(fact.key,64);list(fact.fields,4096);list(fact.absent,4096);
    identity(fact);const names=new Set<string>();
    for(const f of fact.fields){step();members(f,['field','value']);const key=refKey(f.field);
      if(names.has(key)||!type.fields.some(p=>id(p.ref)===key))fail();names.add(key);literal(f.field,f.value);}
    for(const r of fact.absent){const key=refKey(r);if(names.has(key)||!type.fields.some(p=>id(p.ref)===key)||field(r).nullability!=='absent-allowed')fail();names.add(key);}
    keyFields(type).forEach((r,i)=>{const present=value(fact,r);if(present!==undefined&&literal(r,present)!==literal(r,fact.key[i]!))fail();});
  };
  [...cut.subjects,...cut.facts,...request.resources].forEach(validateFact);
  const subject=cut.subjects[0]!;if(id(subject.type)!==id(resolution.ontology.subject))fail();
  const factsByType=new Map<string,SecurityFact[]>(),factIds=new Set<string>();
  for(const fact of cut.facts){const key=identity(fact);if(factIds.has(key))fail();factIds.add(key);
    const rows=factsByType.get(id(fact.type))??[];rows.push(fact);factsByType.set(id(fact.type),rows);}
  const cover=new Map<string,Set<string>>();
  const completeTypes=new Set<string>();
  for(const c of cut.coverage){members(c,['type','complete','fields']);const typeKey=refKey(c.type),type=types.get(typeKey)??fail();list(c.fields,4096);
    if(typeof c.complete!=='boolean'||cover.has(typeKey))fail();const fields=new Set(c.fields.map(refKey));
    if(fields.size!==c.fields.length||c.fields.some(r=>!type.fields.some(f=>id(f.ref)===id(r))))fail();cover.set(typeKey,fields);if(c.complete)completeTypes.add(typeKey);}
  const context=new Map<string,CoreLiteral>();
  for(const c of cut.context){members(c,['field','value']);const key=refKey(c.field);if(context.has(key)||!resolution.ontology.context.some(r=>id(r)===key))fail();literal(c.field,c.value);context.set(key,c.value);}
  if(new Set(request.output.map(refKey)).size!==request.output.length)fail();
  for(const q of request.queryUses??[]){members(q,['field','operator','originalAction']);refKey(q.field);
    if(!['predicate','order','group','join','aggregate'].includes(q.operator)||(q.originalAction!==undefined&&!resolution.ontology.actions.includes(q.originalAction)))fail();}
  const targets=request.targets??Array.from(new Map(request.resources.map(r=>[id(r.type),r.type])).values());
  list(targets,256);if(!targets.length||new Set(targets.map(refKey)).size!==targets.length||targets.some(t=>!types.has(id(t))||!completeTypes.has(id(t)))||
      request.resources.some(r=>!targets.some(t=>id(t)===id(r.type))))fail();
  const scoped=(action:string,type:SecurityRef)=>policy.rules.filter(r=>r.actions.includes(action)&&r.target.some(t=>id(t)===id(type)));
  // Preflight dependencies for every scoped rule, including branches which evaluate false.
  const admitExpression=(expr:SecurityExpr,resource:SecurityFact,vars:Map<string,SecurityAssociation>,resourceRows:SecurityFact[]=[resource])=>{
    step();
    const admitField=(type:SecurityEntity,r:SecurityRef,rows:SecurityFact[])=>{
      if(!completeTypes.has(id(type.type))||!cover.get(id(type.type))?.has(id(r)))fail();
      for(const row of rows){step();if(value(row,r)===undefined&&!row.absent.some(a=>id(a)===id(r)))fail();}
    };
    const term=(t:SecurityTerm)=>{
      if(t.kind==='constant')return;
      if(t.kind==='context'){if(!context.has(id(t.field)))fail();return;}
      const type=t.kind==='subject'?types.get(id(subject.type))!:t.kind==='resource'?types.get(id(resource.type))!:t.kind==='variable'?vars.get(t.name)!:fail();
      if(!completeTypes.has(id(type.type)))fail();
      const rows=t.kind==='subject'?[subject]:t.kind==='resource'?resourceRows:factsByType.get(id(type.type))??[];
      if('field'in t)admitField(type,t.field,rows);
      if('endpoint'in t){const e=(type as SecurityAssociation).endpoints.find(e=>e.role===t.endpoint)!;
        if(!completeTypes.has(id(e.target)))fail();
        for(const r of e.fields)admitField(type,r,rows);}
    };
    if(expr.op==='eq'){term(expr.left);term(expr.right);}
    else if(expr.op==='and'||expr.op==='or')expr.args.forEach(e=>admitExpression(e,resource,vars,resourceRows));
    else if(expr.op==='not')admitExpression(expr.arg,resource,vars,resourceRows);
    else if(expr.op==='exists'){
      const association=types.get(id(expr.association)) as SecurityAssociation;
      if(!completeTypes.has(id(association.type)))fail();const nested=new Map(vars);nested.set(expr.as,association);admitExpression(expr.where,resource,nested,resourceRows);
    }
  };
  // Query selection and original-value dependencies are admitted even for empty
  // collections or false main-action branches; row emptiness is not admission.
  for(const target of targets){
    const type=types.get(id(target))!,rows=request.resources.filter(r=>id(r.type)===id(target));
    if(request.output.some(r=>!type.fields.some(f=>id(f.ref)===id(r))))fail();
    const actions=new Set([request.action]);
    for(const q of request.queryUses??[]){
      const classification=type.fields.find(f=>id(f.ref)===id(q.field))??fail();
      const mode=classification.queryUse?.[q.operator]??(classification.protection==='protected'?'prohibited':'disclosed');
      if(mode==='prohibited')fail();
      if(mode==='original-authorized'){
        if(!q.originalAction||q.originalAction===request.action||!cover.get(id(target))?.has(id(q.field))||
            rows.some(r=>value(r,q.field)===undefined&&!r.absent.some(a=>id(a)===id(q.field))))fail();
        actions.add(q.originalAction??fail());
      }
    }
    for(const action of actions)for(const rule of scoped(action,target))
      admitExpression(rule.condition,{type:target,key:[],fields:[],absent:[]},new Map(),rows);
  }
  const readTerm=(t:SecurityTerm,resource:SecurityFact,vars:Map<string,SecurityFact>):string|undefined=>{
    if(t.kind==='constant')return literal(t.field,t.value);
    if(t.kind==='context'){const v=context.get(id(t.field));return v===undefined?undefined:literal(t.field,v);}
    const fact=t.kind==='subject'?subject:t.kind==='resource'?resource:t.kind==='variable'?vars.get(t.name)!:fail();
    if('identity'in t)return identity(fact);
    if('endpoint'in t){const a=types.get(id(fact.type)) as SecurityAssociation,e=a.endpoints.find(e=>e.role===t.endpoint)!;
      const values=e.fields.map(r=>value(fact,r));if(values.some(v=>v===undefined||v===null))return undefined;
      const target=types.get(id(e.target))!;return canonicalSchemaJson([id(target.type),target.keyId,tuple(target,values as CoreKeyTupleValue[])]);}
    const v=value(fact,t.field);return v===undefined?undefined:literal(t.field,v);
  };
  const expression=(expr:SecurityExpr,resource:SecurityFact,vars:Map<string,SecurityFact>):SecurityTruth=>{
    step();switch(expr.op){
      case'literal':return expr.value?'T':'F';
      case'eq':{const a=readTerm(expr.left,resource,vars),b=readTerm(expr.right,resource,vars);return a===undefined||b===undefined?'U':a===b?'T':'F';}
      case'not':return securityNot(expression(expr.arg,resource,vars));
      case'and':return securityAnd(expr.args.map(e=>expression(e,resource,vars)));
      case'or':return securityOr(expr.args.map(e=>expression(e,resource,vars)));
      case'exists':{let unknown=false,found=false;for(const row of factsByType.get(id(expr.association))??[]){
        step();const nested=new Map(vars);nested.set(expr.as,row);const result=expression(expr.where,resource,nested);unknown ||= result==='U';found ||= result==='T';}
        return found?'T':unknown?'U':'F';}
    }
  };
  const evaluate=(action:string,resource:SecurityFact)=>{
    const rules=scoped(action,resource.type);rules.forEach(r=>admitExpression(r.condition,resource,new Map()));
    const evaluated=rules.map(rule=>({rule,truth:expression(rule.condition,resource,new Map())}));
    const decision:SecurityDecision=evaluated.some(r=>r.truth==='U')?'indeterminate':
      !evaluated.some(r=>r.rule.effect==='permit'&&r.truth==='T')||evaluated.some(r=>r.rule.effect==='require'&&r.truth!=='T')||evaluated.some(r=>r.rule.effect==='forbid'&&r.truth==='T')?'deny':'permit';
    return {decision,evaluated};
  };
  return (resource:SecurityFact):SecurityAccessResult=>{
    const result=evaluate(request.action,resource);if(result.decision!=='permit')return {decision:result.decision,output:[]};
    const type=types.get(id(resource.type))!,obligations=new Map<string,SecurityFieldDisposition[]>();
    for(const {rule,truth}of result.evaluated)if(rule.effect==='permit'&&truth==='T')for(const d of rule.disclosure??[]){const ds=obligations.get(id(d.field))??[];ds.push(d.disposition);obligations.set(id(d.field),ds);}
    const disposition=(r:SecurityRef):SecurityFieldDisposition=>{
      const classification=type.fields.find(f=>id(f.ref)===id(r))??fail(),ds=obligations.get(id(r))??[];
      if(!ds.length&&classification.protection==='protected')fail();
      if(ds.some(d=>d.kind==='withheld'))return {kind:'withheld'};
      const transforms=ds.filter((d):d is Extract<SecurityFieldDisposition,{kind:'transformed'}>=>d.kind==='transformed');
      if(new Set(transforms.map(d=>canonicalSchemaJson([d.transform,d.version,id(d.field),literal(d.field,d.value)]))).size>1)throw new Error('SECURITY_MASK_CONFLICT');
      return transforms[0]??{kind:'original'};
    };
    for(const q of request.queryUses??[]){
      const classification=type.fields.find(f=>id(f.ref)===id(q.field))??fail(),mode=classification.queryUse?.[q.operator]??(classification.protection==='protected'?'prohibited':'disclosed');
      if(mode==='prohibited')fail();
      if(mode==='original-authorized'){if(!q.originalAction||q.originalAction===request.action||!cover.get(id(type.type))?.has(id(q.field))||
          (value(resource,q.field)===undefined&&!resource.absent.some(r=>id(r)===id(q.field)))||evaluate(q.originalAction,resource).decision!=='permit')fail();}
      else {
        const d=disposition(q.field);if(d.kind==='withheld')fail();
        if(d.kind==='original'&&(!cover.get(id(type.type))?.has(id(q.field))||
            value(resource,q.field)===undefined&&!resource.absent.some(a=>id(a)===id(q.field))))fail();
      }
    }
    const output:SecurityOutput[]=request.output.map(r=>{
      const d=disposition(r);if(d.kind==='withheld')return {field:r,disposition:'withheld'};
      if(d.kind==='transformed')return {field:r,disposition:'transformed',outputType:d.field,value:d.value};
      if(!cover.get(id(type.type))?.has(id(r)))fail();
      const v=value(resource,r);if(v!==undefined)return {field:r,disposition:'original',value:v};
      if(resource.absent.some(a=>id(a)===id(r)))return {field:r,disposition:'absent'};return fail();
    });
    return {decision:'permit',output};
  };
}

/** Pure semantic evaluation; host admission and native receipt enforcement remain separate. */
export function evaluateSecurityAccess(policy:SecurityPolicy,resolution:SecurityResolution,cut:SecurityFactCut,request:Omit<SecurityEvaluationRequest,'resources'>,resource:SecurityFact):SecurityAccessResult {
  try{const copied=copyJson(request) as unknown as Omit<SecurityEvaluationRequest,'resources'>;
    return evaluator(policy,resolution,cut,{...copied,resources:[resource]})(copyJson(resource) as unknown as SecurityFact);}
  catch(e){return {decision:e instanceof Error&&e.message==='SECURITY_MASK_CONFLICT'?'conflict':'indeterminate',output:[]};}
}
export function evaluateSecurityCollection(policy:SecurityPolicy,resolution:SecurityResolution,cut:SecurityFactCut,request:SecurityEvaluationRequest):SecurityCollectionResult {
  try{const evaluate=evaluator(policy,resolution,cut,request),rows:SecurityOutput[][]=[];
    for(const resource of copyJson(request.resources) as unknown as SecurityFact[]){const result=evaluate(resource);
      if(result.decision==='indeterminate'||result.decision==='conflict')return {status:'refused',rows:[]};if(result.decision==='permit')rows.push(result.output);}
    return {status:'evaluated',rows};
  }catch{return {status:'refused',rows:[]};}
}

import manifest from '../../../spec/extensions/security/package.json';
import ontologySchema from '../../../spec/extensions/security/ontology.schema.json';
import {Registry} from '../../registry/registry';
import {createValidator} from '../../validation/schema';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {readJsonValue,writeJsonValue} from '../../model/serialization';
import {canonicalSchemaJson,checkSchemaLiteral,type CoreLiteral} from '../../model/schema-literals';
import {UmfError,pointer,type Diagnostic,type Element,type Document,type ExtensionPackage,type Json,type Validation} from '../../model/types';
import {securityRefIdentity as id,type SecurityPolicy,type SecurityRef,type SecurityResolution,type SecurityEntity,type SecurityAssociation,type SecurityExpr,type SecurityTerm} from './types';

export const SECURITY_EXTENSION='umf.security';
// Public package metadata is a copy; editing it cannot replace built-in meaning.
export const securityPackage=copyJson(manifest) as unknown as ExtensionPackage;
const validator=createValidator(),checkPolicy=validator.compile(manifest.schema),checkOntology=validator.compile(ontologySchema);
export interface SecurityInspection extends Validation {source:Json;resolution?:Json}

/** Preservation is independent of interpretation; unfamiliar policy versions/operators remain data. */
export const readSecuritySource=(text:string,format:'json'|'yaml'='json'):Json=>readJsonValue(text,format);
export const writeSecuritySource=(value:unknown,format:'json'|'yaml'='json'):string=>writeJsonValue(copyJson(value),format);

export function inspectSecurityPolicy(input:unknown,resolutionInput?:SecurityResolution):SecurityInspection {
  const diagnostics:Diagnostic[]=[];
  const add=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>diagnostics.push({code,path,message,severity});
  let source:Json;
  try {source=copyJson(input);} catch(e) {
    if(!(e instanceof UmfError))throw e;
    return {source:null,valid:false,complete:false,diagnostics:[{code:e.code,path:e.path,message:e.message,severity:'error'}]};
  }
  const finish=(resolution?:Json):SecurityInspection=>({source,...(resolution===undefined?{}:{resolution}),
    valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics});
  if(!checkPolicy(source)) {
    for(const e of checkPolicy.errors??[])add('SECURITY_STRUCTURE',e.instancePath,e.message??'Invalid policy');
    return finish();
  }
  const policy=source as unknown as SecurityPolicy;
  const unknown=(value:object,known:string[],path:string)=>{
    for(const key of Object.keys(value))if(!known.includes(key))add('SECURITY_UNKNOWN',path+'/'+pointer(key),'Uninterpreted security member retained','warning');
  };
  unknown(policy,['vocabulary','version','id','revision','ontology','rules','native'],'');
  unknown(policy.ontology,['documentId','revision'],'/ontology');
  const reference=(r:SecurityRef,path:string)=>unknown(r,['documentId','moduleId','elementId'],path);
  const duplicate=(values:string[],path:string)=>{if(new Set(values).size!==values.length)add('SECURITY_DUPLICATE',path,'Duplicate security identity');};
  duplicate(policy.rules.map(r=>r.id),'/rules');
  let nodes=0;
  const termShape=(term:SecurityTerm,path:string)=>{
    unknown(term,['kind',...('name'in term?['name']:[]),...('identity'in term?['identity']:[]),...('endpoint'in term?['endpoint']:[]),...('field'in term?['field']:[]),...('value'in term?['value']:[])],path);
    if('field'in term)reference(term.field,path+'/field');
  };
  const expression=(expr:SecurityExpr,path:string,depth:number)=>{
    if(++nodes>4096||depth>16){add('SECURITY_BOUND',path,'Expression depth/node bound exceeded');return;}
    switch(expr.op){
      case'literal':unknown(expr,['op','value'],path);break;
      case'eq':unknown(expr,['op','left','right'],path);termShape(expr.left,path+'/left');termShape(expr.right,path+'/right');break;
      case'and':case'or':unknown(expr,['op','args'],path);expr.args.forEach((e,i)=>expression(e,path+'/args/'+i,depth+1));break;
      case'not':unknown(expr,['op','arg'],path);expression(expr.arg,path+'/arg',depth+1);break;
      case'exists':unknown(expr,['op','association','as','where'],path);reference(expr.association,path+'/association');expression(expr.where,path+'/where',depth+1);break;
    }
  };
  policy.rules.forEach((rule,i)=>{
    const path='/rules/'+i;
    unknown(rule,['id','effect','actions','target','condition','disclosure'],path);
    duplicate(rule.actions,path+'/actions');duplicate(rule.target.map(id),path+'/target');
    rule.target.forEach((r,j)=>reference(r,path+'/target/'+j));
    if(rule.effect!=='permit'&&rule.disclosure!==undefined)add('SECURITY_DISCLOSURE',path,'Only permits may carry disclosure');
    duplicate(rule.disclosure?.map(d=>id(d.field))??[],path+'/disclosure');
    rule.disclosure?.forEach((d,j)=>{
      const p=path+'/disclosure/'+j;unknown(d,['field','disposition'],p);reference(d.field,p+'/field');
      unknown(d.disposition,d.disposition.kind==='transformed'?['kind','transform','version','field','value']:['kind'],p+'/disposition');
      if(d.disposition.kind==='transformed')reference(d.disposition.field,p+'/disposition/field');
    });
    expression(rule.condition,path+'/condition',1);
  });
  if(diagnostics.some(d=>d.code==='SECURITY_BOUND'))return finish();
  if(resolutionInput===undefined){add('SECURITY_RESOLUTION_REQUIRED','/ontology','Explicit pinned ontology/document closure required','warning');return finish();}
  let resolution:Json;
  try {resolution=copyJson(resolutionInput);}catch(e){if(!(e instanceof UmfError))throw e;add(e.code,e.path,e.message);return finish();}
  const resolved=resolution as unknown as SecurityResolution;
  if(!resolved||typeof resolved!=='object'||Array.isArray(resolved)||!Array.isArray(resolved.documents)||resolved.documents.length>256||!checkOntology(resolved.ontology)){
    add('SECURITY_ONTOLOGY_STRUCTURE','/resolution','Invalid ontology/document resolution package');return finish(resolution);
  }
  unknown(resolved,['ontology','documents'],'/resolution');
  const ontology=resolved.ontology;
  unknown(ontology,['version','documentId','revision','documents','subject','entities','associations','context','actions'],'/resolution/ontology');
  if(policy.ontology.documentId!==ontology.documentId||policy.ontology.revision!==ontology.revision)add('SECURITY_REVISION','/ontology','Ontology identity/revision mismatch');
  duplicate(ontology.documents.map(d=>d.documentId),'/resolution/ontology/documents');
  duplicate(ontology.actions,'/resolution/ontology/actions');
  const documents=new Map<string,Document>();
  const documentWarnings=new Map<string,Diagnostic[]>();
  resolved.documents.forEach((entry,i)=>{
    const path='/resolution/documents/'+i;
    if(!entry||typeof entry!=='object'||Array.isArray(entry)||typeof entry.revision!=='string'||!entry.revision||!entry.document){add('SECURITY_DOCUMENT',path,'Invalid document revision');return;}
    unknown(entry,['revision','document'],path);
    const validation=validateDocument(entry.document);
    if(!validation.valid||entry.document.umf!=='0.8.0'){add('SECURITY_DOCUMENT',path,'Valid current core 0.8.0 document required');return;}
    const pin=ontology.documents.find(d=>d.documentId===entry.document.id);
    if(!pin||pin.revision!==entry.revision||documents.has(entry.document.id)){add('SECURITY_REVISION',path,'Unpinned, stale or duplicate document');return;}
    documents.set(entry.document.id,entry.document);
    documentWarnings.set(entry.document.id,validation.diagnostics.filter(d=>d.severity==='warning'));
  });
  ontology.documents.forEach((pin,i)=>{
    unknown(pin,['documentId','revision'],'/resolution/ontology/documents/'+i);
    if(!documents.has(pin.documentId))add('SECURITY_DOCUMENT','/resolution/ontology/documents/'+i,'Pinned document missing');
  });
  const locate=(r:SecurityRef,path:string):Element|undefined=>{
    reference(r,path);const document=documents.get(r.documentId),mi=document?.modules.findIndex(m=>m.id===r.moduleId)??-1;
    const ei=document?.modules[mi]?.elements.findIndex(e=>e.id===r.elementId)??-1,element=document?.modules[mi]?.elements[ei];
    if(!element)add('SECURITY_REFERENCE',path,'Qualified definition does not resolve');
    if(element?.kind==='field'){
      const prefix=`/modules/${mi}/elements/${ei}`;
      if(documentWarnings.get(r.documentId)?.some(d=>d.path.startsWith(prefix+'/')&&!d.path.startsWith(prefix+'/extensions/')&&d.code.startsWith('UNKNOWN_')))
        add('SECURITY_UNKNOWN',path,'Field has an unqualified core domain meaning','warning');
    }
    return element;
  };
  const types=new Map<string,SecurityEntity|SecurityAssociation>();
  const keyFields=(entity:SecurityEntity):SecurityRef[]=>{
    const record=documents.get(entity.type.documentId)?.modules.find(m=>m.id===entity.type.moduleId)?.elements.find(e=>e.id===entity.type.elementId);
    const key=(record?.keys as {id:string;fields:{module:string;element:string}[]}[]|undefined)?.find(k=>k.id===entity.keyId);
    return key?.fields.map(f=>({documentId:entity.type.documentId,moduleId:f.module,elementId:f.element}))??[];
  };
  const domain=(field:Element|undefined,path:string):string|undefined=>{
    if(!field)return undefined;
    if(field.kind!=='field'||!['boolean','string','integer','decimal','binary'].includes(field.scalarType??'')||
        field.cardinality!=='one'||field.references?.some(r=>r.role==='record-type')){
      add('SECURITY_DOMAIN',path,'Only exact scalar singleton domains are interpreted');return undefined;
    }
    // Unknown equality/refinement semantics may never be silently ignored.
    const known=['id','kind','name','description','extensions','scalarType','nullability','cardinality','facets','references','title','aliases','examples','allowedValues','default'];
    if(Object.keys(field).some(k=>!known.includes(k)))add('SECURITY_UNKNOWN',path,'Field has uninterpreted qualifier','warning');
    const facets=field.facets as Record<string,unknown>|undefined;
    if(facets){
      unknown(facets,['length','precision','scale','integerWidth','range','collectionSize'],path+'/facets');
      for(const [group,keys]of Object.entries({length:['min','max','unit'],integerWidth:['bits','signed'],range:['min','max','minInclusive','maxInclusive'],collectionSize:['min','max']})){
        if(facets[group]!==undefined)unknown(facets[group] as object,keys,path+'/facets/'+group);
      }
    }
    if(field.scalarType==='decimal'&&(!Number.isSafeInteger(facets?.scale)||!Number.isSafeInteger(facets?.precision)))add('SECURITY_DOMAIN',path,'Decimal equality requires explicit precision/scale');
    return canonicalSchemaJson({scalarType:field.scalarType,cardinality:field.cardinality,nullability:field.nullability,facets:field.facets??{},allowedValues:field.allowedValues??null});
  };
  for(const [i,entity]of [...ontology.entities,...ontology.associations].entries()){
    const path='/resolution/ontology/types/'+i;
    unknown(entity,'endpoints'in entity?['type','keyId','fields','endpoints']:['type','keyId','fields'],path);
    const record=locate(entity.type,path+'/type');
    if(types.has(id(entity.type)))add('SECURITY_DUPLICATE',path,'Duplicate logical type');else types.set(id(entity.type),entity);
    if(record?.kind!=='record'||!keyFields(entity).length)add('SECURITY_KEY',path,'Explicit Record and stable Key required');
    duplicate(entity.fields.map(f=>id(f.ref)),path+'/fields');
    const members=(record?.members as {module:string;element:string}[]|undefined)?.map(f=>id({documentId:entity.type.documentId,moduleId:f.module,elementId:f.element}))??[];
    if(canonicalSchemaJson([...members].sort())!==canonicalSchemaJson(entity.fields.map(f=>id(f.ref)).sort()))add('SECURITY_CLASSIFICATION',path+'/fields','Every Record member requires explicit security classification');
    entity.fields.forEach((f,j)=>{
      const p=path+'/fields/'+j;unknown(f,['ref','protection','queryUse'],p);domain(locate(f.ref,p+'/ref'),p+'/ref');
      if(f.queryUse)unknown(f.queryUse,['predicate','order','group','join','aggregate'],p+'/queryUse');
    });
    // Relevant unknown key/member content blocks interpretation without erasing it.
    const key=(record?.keys as Record<string,unknown>[]|undefined)?.find(k=>k.id===entity.keyId);
    if(key){unknown(key,['id','name','fields','primary'],path+'/key');if(Object.hasOwn(key,'primary')&&typeof key.primary!=='boolean')add('SECURITY_KEY',path+'/key/primary','Primary metadata must be Boolean');for(const r of key.fields as object[])unknown(r,['module','element'],path+'/key/fields');}
    for(const r of (record?.members??[])as object[])unknown(r,['module','element'],path+'/members');
  }
  if(!ontology.entities.some(e=>id(e.type)===id(ontology.subject)))add('SECURITY_SUBJECT','/resolution/ontology/subject','Subject must resolve to declared entity');
  reference(ontology.subject,'/resolution/ontology/subject');
  ontology.context.forEach((r,i)=>domain(locate(r,'/resolution/ontology/context/'+i),'/resolution/ontology/context/'+i));
  duplicate(ontology.context.map(id),'/resolution/ontology/context');
  ontology.associations.forEach((a,i)=>{
    duplicate(a.endpoints.map(e=>e.role),'/resolution/ontology/associations/'+i+'/endpoints');
    a.endpoints.forEach((e,j)=>{
      const path='/resolution/ontology/associations/'+i+'/endpoints/'+j;unknown(e,['role','target','fields'],path);reference(e.target,path+'/target');
      const target=types.get(id(e.target));
      if(!target){add('SECURITY_ENDPOINT',path,'Endpoint target is undeclared');return;}
      const keys=keyFields(target);
      if(e.fields.length!==keys.length)add('SECURITY_ENDPOINT',path,'Endpoint must supply every target Key component');
      duplicate(e.fields.map(id),path+'/fields');
      e.fields.forEach((r,k)=>{
        if(!a.fields.some(f=>id(f.ref)===id(r)))add('SECURITY_ENDPOINT',path,'Endpoint field is not an association member');
        const left=domain(locate(r,path+'/fields/'+k),path),right=keys[k]?domain(locate(keys[k]!,path+'/targetKey/'+k),path):undefined;
        if(left!==undefined&&right!==undefined&&left!==right)add('SECURITY_ENDPOINT',path,'Endpoint and target Key domains differ');
      });
    });
  });
  type Binding=SecurityEntity|SecurityAssociation;
  const termType=(term:SecurityTerm,resource:Binding,variables:Map<string,SecurityAssociation>,path:string):string|undefined=>{
    const binding=term.kind==='subject'?types.get(id(ontology.subject)):term.kind==='resource'?resource:term.kind==='variable'?variables.get(term.name):undefined;
    if(term.kind==='variable'&&!binding)add('SECURITY_VARIABLE',path,'Variable is not bound');
    if('identity'in term)return binding?'identity:'+id(binding.type)+':'+binding.keyId:undefined;
    if('endpoint'in term){
      const endpoint=term.kind==='variable'?variables.get(term.name)?.endpoints.find(e=>e.role===term.endpoint):undefined;
      const target=endpoint?types.get(id(endpoint.target)):undefined;
      if(!target)add('SECURITY_ENDPOINT',path,'Declared endpoint role does not resolve');
      return target?'identity:'+id(target.type)+':'+target.keyId:undefined;
    }
    const field=locate(term.field,path+'/field');
    if(term.kind==='context'?!ontology.context.some(r=>id(r)===id(term.field)):term.kind!=='constant'&&!binding?.fields.some(f=>id(f.ref)===id(term.field)))add('SECURITY_FIELD',path,'Field is not declared on the selected binding');
    const result=domain(field,path+'/field');
    if(term.kind==='constant'&&field){try{checkSchemaLiteral(documents.get(term.field.documentId)!,field,term.value);}catch{add('SECURITY_CONSTANT',path,'Constant violates its exact declared domain');}}
    return result;
  };
  const typedExpression=(expr:SecurityExpr,resource:Binding,variables:Map<string,SecurityAssociation>,path:string,depth:number)=>{
    if(depth>16)return;
    if(expr.op==='eq'){
      const left=termType(expr.left,resource,variables,path+'/left'),right=termType(expr.right,resource,variables,path+'/right');
      if(left!==undefined&&right!==undefined&&left!==right)add('SECURITY_OPERANDS',path,'Equality operands have different declared types');
    }else if(expr.op==='and'||expr.op==='or')expr.args.forEach((e,i)=>typedExpression(e,resource,variables,path+'/args/'+i,depth+1));
    else if(expr.op==='not')typedExpression(expr.arg,resource,variables,path+'/arg',depth+1);
    else if(expr.op==='exists'){
      const association=ontology.associations.find(a=>id(a.type)===id(expr.association));
      if(!association){add('SECURITY_ASSOCIATION',path,'Exists requires a declared association');return;}
      if(variables.has(expr.as)){add('SECURITY_VARIABLE',path,'Exists variable must be fresh');return;}
      const nested=new Map(variables);nested.set(expr.as,association);typedExpression(expr.where,resource,nested,path+'/where',depth+1);
    }
  };
  policy.rules.forEach((rule,i)=>{
    const path='/rules/'+i;
    rule.actions.forEach(action=>{if(!ontology.actions.includes(action))add('SECURITY_ACTION',path+'/actions','Undeclared action');});
    for(const r of rule.target){
      const target=types.get(id(r));if(!target){add('SECURITY_TARGET',path+'/target','Undeclared target type');continue;}
      typedExpression(rule.condition,target,new Map(),path+'/condition',1);
      for(const d of rule.disclosure??[]){
        if(!target.fields.some(f=>id(f.ref)===id(d.field)))add('SECURITY_DISCLOSURE',path+'/disclosure','Output field must belong to every target');
        if(d.disposition.kind==='transformed'){
          const out=locate(d.disposition.field,path+'/disclosure/output'),outputType=domain(out,path+'/disclosure/output');
          if(outputType===undefined)continue;
          try{checkSchemaLiteral(documents.get(d.disposition.field.documentId)!,out!,d.disposition.value as CoreLiteral);}catch{add('SECURITY_CONSTANT',path+'/disclosure','Transform constant violates declared output domain');}
        }
      }
    }
  });
  return finish(resolution);
}

export function securityRegistry():Registry {
  return new Registry().register(manifest as unknown as ExtensionPackage,(payload,context)=>inspectSecurityPolicy(payload).diagnostics.map(d=>({...d,path:context.path+d.path})));
}
export function requireSecurityInterpretation(policy:unknown,resolution:SecurityResolution):SecurityInspection {
  const result=inspectSecurityPolicy(policy,resolution);
  if(!result.valid||!result.complete)throw new UmfError('SECURITY_INTERPRETATION','Security interpretation refused');
  return result;
}

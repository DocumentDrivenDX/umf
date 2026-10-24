// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../model/json';
import {readDocument} from '../model/document';
import {UmfError} from '../model/types';
import {canonical,hashCanonical,sha256Text} from '../compilation/bundle/hash';
import {inspectTableLifecycle,type TableRef} from '../extensions/tables';
import {deploymentConfiguration,deploymentError} from './configuration';
import {deploymentSteps} from './ddl';
import {quoteIdentifier} from './sql';
import type {DeploymentContext,InternalTableDeploymentOperation,InternalTableDeploymentOperationRecord,TableDeploymentBundle,TableDeploymentResult,TableDeploymentStep} from './types';
export type {TableDeploymentConfiguration,TableDeploymentBundle,TableDeploymentResult,TableDeploymentStep} from './types';
/** Generate inert reviewable SQL; no I/O, installation or native qualification. */
export function compileTableDeployment(input:{text:string;format?:'json'|'yaml';configuration:unknown}):TableDeploymentResult{return compileDeployment(input,false);}
/** Internal-only source operation sidecar; public deployment bundle bytes are unchanged. */
export function compileTableDeploymentWithOperations(input:{text:string;format?:'json'|'yaml';configuration:unknown}):{status:'compiled';bundle:TableDeploymentBundle;operations:InternalTableDeploymentOperationRecord[]}|{status:'blocked';diagnostics:Extract<TableDeploymentResult,{status:'blocked'}>['diagnostics']}{
 const result=compileDeploymentInternal(input,false);return result.status==='compiled'?{status:'compiled',bundle:result.bundle,operations:result.operations}:{status:'blocked',diagnostics:result.diagnostics};
}
type InternalDeploymentResult={status:'compiled';bundle:TableDeploymentBundle;diagnostics:[];operations:InternalTableDeploymentOperationRecord[]}|{status:'blocked';diagnostics:Extract<TableDeploymentResult,{status:'blocked'}>['diagnostics']};
function compileDeployment(input:{text:string;format?:'json'|'yaml';configuration:unknown},legacyComments:boolean):TableDeploymentResult{
 const result=compileDeploymentInternal(input,legacyComments);return result.status==='compiled'?{status:'compiled',bundle:result.bundle,diagnostics:[]}:result;
}
function compileDeploymentInternal(input:{text:string;format?:'json'|'yaml';configuration:unknown},legacyComments:boolean):InternalDeploymentResult {
 try{
  const format=input.format??'json';
  if(format!=='json'&&format!=='yaml')deploymentError('Unknown source serialization','/source/format');
  const sourceDigest=sha256Text(input.text,4_000_000),configuration=deploymentConfiguration(input.configuration);
  const document=readDocument(input.text,format),inspection=inspectTableLifecycle(document);
  if(!inspection.valid||!inspection.complete)return {status:'blocked',diagnostics:inspection.diagnostics};
  const payload=inspection.modules.find(m=>m.module===configuration.module)?.payload;
  if(!payload)deploymentError('Configured module has no table lifecycle declaration','/configuration/module');
  const moduleIndex=document.modules.findIndex(m=>m.id===configuration.module),module=document.modules[moduleIndex]!;
  if(Object.keys(module.extensions??{}).some(k=>k!=='umf.tables')||module.elements.some(e=>e.kind==='record'&&Object.keys(e.extensions).length))deploymentError('Selected module/Record extensions require a qualified combined profile','/modules/'+moduleIndex);
  const steps:TableDeploymentStep[]=[],operations:InternalTableDeploymentOperationRecord[]=[],path='/modules/'+moduleIndex+'/extensions/umf.tables';
  const same=(a:TableRef,b:TableRef)=>a.module===b.module&&a.element===b.element;
  const ctx:DeploymentContext={document,payload,configuration,path,steps,
   field(ref){const field=document.modules.find(m=>m.id===ref.module)?.elements.find(e=>e.id===ref.element);if(!field||field.kind!=='field')return deploymentError('Missing original Field',path);return field;},
   table(ref){return payload.tables.find(t=>same(t.record,ref))??deploymentError('External/missing native table dependency',path);},
   column(table,ref){return table.columns.find(c=>same(c.field,ref))?.name??deploymentError('Missing exact column mapping',path);},
   relation(table){return quoteIdentifier(configuration.schema)+'.'+quoteIdentifier(table.name);},
   add(kind,sourcePath,sql,operation){if(steps.length>=8192||new TextEncoder().encode(sql).length>1_000_000)deploymentError('Deployment step/statement bound exceeded',sourcePath);const step={id:'step-'+String(steps.length+1).padStart(5,'0'),kind,sourcePath,transaction:'required' as const,sql};steps.push(step);operations.push({...operation,stepId:step.id,sourcePath,kind,transaction:'required',sql});}
  };
  const expectedCatalog=deploymentSteps(ctx);
  if(legacyComments){
   delete expectedCatalog.comments;
   const renumbered=new Map<string,string>();let ordinal=0;
   for(let i=steps.length-1;i>=0;i--)if(steps[i]!.kind==='comment')steps.splice(i,1);
   for(const step of steps){const oldId=step.id;step.id='step-'+String(++ordinal).padStart(5,'0');renumbered.set(oldId,step.id);}
   for(let i=operations.length-1;i>=0;i--){const op=operations[i]!,newId=renumbered.get(op.stepId);if(!newId)operations.splice(i,1);else op.stepId=newId;}
  }
  ctx.add('grant',path,'GRANT USAGE ON SCHEMA '+quoteIdentifier(configuration.schema)+' TO '+quoteIdentifier(configuration.personRole)+', '+quoteIdentifier(configuration.batchRole),{operation:'grant-schema-usage',subject:{kind:'schema-grant',schema:configuration.schema,audiences:['person','batch'],privilege:'USAGE'}});
  if(operations.length!==steps.length||operations.some((operation,index)=>{
   const step=steps[index];return !step||operation.stepId!==step.id||operation.kind!==step.kind||operation.sourcePath!==step.sourcePath||operation.transaction!==step.transaction||operation.sql!==step.sql;
  }))deploymentError('Internal operation projection differs from emitted deployment steps');
  const version:TableDeploymentBundle['version']=expectedCatalog.comments?'umf.table-deployment/0.2':'umf.table-deployment/0.1';
  const body={version,canonicalization:'RFC8785' as const,source:{format,utf8:input.text},sourceDigest,configuration,configurationDigest:hashCanonical(configuration),module:configuration.module,profile:payload.profile,steps,expectedCatalog,seedSets:payload.seedSets,nativeQualified:false as const};
  // copyJson prevents output aliases from escaping into caller input or authority.
  if(new TextEncoder().encode(canonical(body)).length>16_000_000)deploymentError('Deployment bundle exceeds16MB');
  const bundle=copyJson({...body,bundleDigest:hashCanonical(body)}) as unknown as TableDeploymentBundle;
  const copiedOperations:InternalTableDeploymentOperationRecord[]=structuredClone(operations);
  return {status:'compiled',bundle,diagnostics:[],operations:copiedOperations};
 }catch(error){
  if(error instanceof UmfError)return {status:'blocked',diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};
  if(error instanceof Error&&['INPUT','LIMIT'].includes(error.message))return {status:'blocked',diagnostics:[{code:'TABLE_DEPLOYMENT_INPUT',path:'',message:'Invalid Unicode or source resource limit',severity:'error'}]};
  throw error;
 }
}
/** Recompile complete source/configuration; self-consistent forged SQL is not authority. */
export function verifyTableDeployment(input:unknown):TableDeploymentBundle{
 const value=copyJson(input) as unknown as TableDeploymentBundle;
 if(!value||!['umf.table-deployment/0.1','umf.table-deployment/0.2'].includes(value.version)||!value.source)deploymentError('Unknown deployment bundle');
 const result=compileDeployment({text:value.source.utf8,format:value.source.format,configuration:value.configuration},value.version==='umf.table-deployment/0.1');
 if(result.status!=='compiled'||canonical(value)!==canonical(result.bundle))deploymentError('Deployment differs from exact source recompilation');
 return result.bundle;
}

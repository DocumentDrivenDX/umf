// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson,copyJsonCharged} from '../model/json';
import {readDocument} from '../model/document';
import {UmfError} from '../model/types';
import {canonical,canonicalCharged,hashCanonical,hashCanonicalCharged,sha256Text,sha256TextCharged} from '../compilation/bundle/hash';
import {inspectTableLifecycle,inspectTableLifecycleWithAccounting,type TableRef} from '../extensions/tables';
import {deploymentConfiguration,deploymentError} from './configuration';
import {deploymentSteps} from './ddl';
import {quoteIdentifier,sqlJoin} from './sql';
import type {DeploymentContext,InternalTableDeploymentOperation,InternalTableDeploymentOperationRecord,TableDeploymentBundle,TableDeploymentResult,TableDeploymentStep} from './types';
import type {AccountingContext} from '../model/internal/accounting-context';
import {readJsonDocumentWithAccounting} from '../model/document-accounting';
function utf8Length(value:string):number{let bytes=0;for(let i=0;i<value.length;i++){const c=value.charCodeAt(i);if(c<0x80)bytes++;else if(c<0x800)bytes+=2;else if(c>=0xd800&&c<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}else bytes+=3;}return bytes;}
const copyHooks=(accounting:AccountingContext)=>({beforeProperty:(key:string,path:string,isArray:boolean)=>{accounting.visit('deployment-copy-property-preflight',path);if(!isArray)accounting.scanUtf8(key,path);},retainText:(text:string,path:string)=>{accounting.scanUtf8(text,path);}});
export type {TableDeploymentConfiguration,TableDeploymentBundle,TableDeploymentResult,TableDeploymentStep} from './types';
/** Generate inert reviewable SQL; no I/O, installation or native qualification. */
export function compileTableDeployment(input:{text:string;format?:'json'|'yaml';configuration:unknown}):TableDeploymentResult{return compileDeployment(input,false);}
/** Private metered JSON compiler for R2's shared root accounting scope. */
export function compileTableDeploymentWithAccounting(input:{text:string;format?:'json'|'yaml';configuration:unknown},accounting:AccountingContext):InternalDeploymentResult{
 return compileDeploymentInternal(input,false,accounting);
}
/** Internal-only source operation sidecar; public deployment bundle bytes are unchanged. */
export function compileTableDeploymentWithOperations(input:{text:string;format?:'json'|'yaml';configuration:unknown}):{status:'compiled';bundle:TableDeploymentBundle;operations:InternalTableDeploymentOperationRecord[]}|{status:'blocked';diagnostics:Extract<TableDeploymentResult,{status:'blocked'}>['diagnostics']}{
 const result=compileDeploymentInternal(input,false);return result.status==='compiled'?{status:'compiled',bundle:result.bundle,operations:result.operations}:{status:'blocked',diagnostics:result.diagnostics};
}
type InternalDeploymentResult={status:'compiled';bundle:TableDeploymentBundle;document:import('../model/types').Document;diagnostics:[];operations:InternalTableDeploymentOperationRecord[]}|{status:'blocked';diagnostics:Extract<TableDeploymentResult,{status:'blocked'}>['diagnostics']};
function compileDeployment(input:{text:string;format?:'json'|'yaml';configuration:unknown},legacyComments:boolean):TableDeploymentResult{
 const result=compileDeploymentInternal(input,legacyComments);return result.status==='compiled'?{status:'compiled',bundle:result.bundle,diagnostics:[]}:result;
}
function compileDeploymentInternal(input:{text:string;format?:'json'|'yaml';configuration:unknown},legacyComments:boolean,accounting?:AccountingContext):InternalDeploymentResult {
 try{
  const format=input.format??'json';
  if(format!=='json'&&format!=='yaml')deploymentError('Unknown source serialization','/source/format');
  if(accounting&&format!=='json')deploymentError('Metered R2 deployment accepts JSON source only','/source/format');
  const sourceDigest=accounting?sha256TextCharged(input.text,4_000_000,accounting,'/source'):sha256Text(input.text,4_000_000);
  const configurationInput=accounting?copyJsonCharged(input.configuration,n=>accounting.visit('deployment-configuration-copy','/configuration',n),copyHooks(accounting)):input.configuration;
  const configuration=deploymentConfiguration(configurationInput);
  const document=accounting?readJsonDocumentWithAccounting(input.text,accounting):readDocument(input.text,format),inspection=accounting?inspectTableLifecycleWithAccounting(document,accounting):inspectTableLifecycle(document);
  if(!inspection.valid||!inspection.complete)return {status:'blocked',diagnostics:inspection.diagnostics};
  let selectedInspection:typeof inspection.modules[number]|undefined;for(const item of inspection.modules){accounting?.visit('deployment-inspection-module-scan','/configuration/module');if(item.module===configuration.module){selectedInspection=item;break;}}const payload=selectedInspection?.payload;
  if(!payload)deploymentError('Configured module has no table lifecycle declaration','/configuration/module');
  let moduleIndex=-1;for(let i=0;i<document.modules.length;i++){accounting?.visit('deployment-module-index-scan','/configuration/module');if(document.modules[i]!.id===configuration.module){moduleIndex=i;break;}}const module=document.modules[moduleIndex]!;
  let unsupportedExtension=false;for(const key in module.extensions??{})if(Object.hasOwn(module.extensions??{},key)){accounting?.visit('deployment-module-extension-scan',`/modules/${moduleIndex}/extensions`);if(key!=='umf.tables')unsupportedExtension=true;}for(const element of module.elements){accounting?.visit('deployment-element-extension-scan',`/modules/${moduleIndex}/elements`);if(element.kind==='record')for(const key in element.extensions)if(Object.hasOwn(element.extensions,key)){accounting?.visit('deployment-record-extension-scan',`/modules/${moduleIndex}/elements/${element.id}/extensions`);unsupportedExtension=true;}}if(unsupportedExtension)deploymentError('Selected module/Record extensions require a qualified combined profile','/modules/'+moduleIndex);
  const steps:TableDeploymentStep[]=[],operations:InternalTableDeploymentOperationRecord[]=[],path='/modules/'+moduleIndex+'/extensions/umf.tables';
  const same=(a:TableRef,b:TableRef)=>a.module===b.module&&a.element===b.element;
  const ctx:DeploymentContext={document,payload,configuration,path,steps,...(accounting?{accounting}:{}),
   field(ref){let module;for(const candidate of document.modules){accounting?.visit('deployment-module-predicate',path);if(candidate.id===ref.module){module=candidate;break;}}let field;if(module)for(const candidate of module.elements){accounting?.visit('deployment-element-predicate',path);if(candidate.id===ref.element){field=candidate;break;}}if(!field||field.kind!=='field')return deploymentError('Missing original Field',path);return field;},
   table(ref){for(const candidate of payload.tables){accounting?.visit('deployment-table-predicate',path);if(same(candidate.record,ref))return candidate;}return deploymentError('External/missing native table dependency',path);},
   column(table,ref){for(const candidate of table.columns){accounting?.visit('deployment-column-predicate',path);if(same(candidate.field,ref))return candidate.name;}return deploymentError('Missing exact column mapping',path);},
   relation(table){return sqlJoin([quoteIdentifier(configuration.schema,accounting,path+'/schema'),'.',quoteIdentifier(table.name,accounting,path+'/relation')],accounting,path+'/relation');},
   add(kind,sourcePath,sql,operation){const sqlBytes=accounting?accounting.scanUtf8(sql,sourcePath):utf8Length(sql);if(steps.length>=8192||sqlBytes>1_000_000)deploymentError('Deployment step/statement bound exceeded',sourcePath);accounting?.visit('deployment-step-retention',sourcePath);const step={id:'step-'+String(steps.length+1).padStart(5,'0'),kind,sourcePath,transaction:'required' as const,sql};steps.push(step);accounting?.visit('deployment-operation-retention',sourcePath);operations.push({...operation,stepId:step.id,sourcePath,kind,transaction:'required',sql});}
  };
  const expectedCatalog=deploymentSteps(ctx);
  if(legacyComments){
   delete expectedCatalog.comments;
   const renumbered=new Map<string,string>();let ordinal=0;
   for(let i=steps.length-1;i>=0;i--)if(steps[i]!.kind==='comment')steps.splice(i,1);
   for(const step of steps){accounting?.visit('deployment-legacy-step-renumber',path);const oldId=step.id;step.id='step-'+String(++ordinal).padStart(5,'0');renumbered.set(oldId,step.id);}
   for(let i=operations.length-1;i>=0;i--){accounting?.visit('deployment-legacy-operation-renumber',path);const op=operations[i]!,newId=renumbered.get(op.stepId);if(!newId)operations.splice(i,1);else op.stepId=newId;}
  }
  ctx.add('grant',path,sqlJoin(['GRANT USAGE ON SCHEMA ',quoteIdentifier(configuration.schema,accounting,path), ' TO ',quoteIdentifier(configuration.personRole,accounting,path),', ',quoteIdentifier(configuration.batchRole,accounting,path)],accounting,path),{operation:'grant-schema-usage',subject:{kind:'schema-grant',schema:configuration.schema,audiences:['person','batch'],privilege:'USAGE'}});
  let operationMismatch=operations.length!==steps.length;for(let index=0;index<operations.length&&!operationMismatch;index++){accounting?.visit('deployment-operation-compare',`/operations/${index}`);const operation=operations[index]!,step=steps[index];operationMismatch=!step||operation.stepId!==step.id||operation.kind!==step.kind||operation.sourcePath!==step.sourcePath||operation.transaction!==step.transaction||operation.sql!==step.sql;}if(operationMismatch)deploymentError('Internal operation projection differs from emitted deployment steps');
  const version:TableDeploymentBundle['version']=expectedCatalog.comments?'umf.table-deployment/0.2':'umf.table-deployment/0.1';
  const configurationDigest=accounting?hashCanonicalCharged(configuration,accounting,'/configuration'):hashCanonical(configuration);
  accounting?.visit('deployment-bundle-body-construction','/bundle/body',12);accounting?.visit('deployment-source-envelope-construction','/bundle/source',2);const body={version,canonicalization:'RFC8785' as const,source:{format,utf8:input.text},sourceDigest,configuration,configurationDigest,module:configuration.module,profile:payload.profile,steps,expectedCatalog,seedSets:payload.seedSets,nativeQualified:false as const};
  const bodyCanonical=accounting?canonicalCharged(body,accounting,'/bundle/body'):canonical(body);
  if(utf8Length(bodyCanonical)>16_000_000)deploymentError('Deployment bundle exceeds16MB');
  const bundleDigest=accounting?hashCanonicalCharged(body,accounting,'/bundle/body'):hashCanonical(body);
  accounting?.visit('deployment-bundle-digest-envelope','/bundle',1);const bundle=(accounting?copyJsonCharged({...body,bundleDigest},n=>accounting.visit('deployment-bundle-copy','/bundle',n),copyHooks(accounting)):structuredClone({...body,bundleDigest})) as unknown as TableDeploymentBundle;
  const copiedOperations=(accounting?copyJsonCharged(operations,n=>accounting.visit('deployment-operation-copy','/operations',n),copyHooks(accounting)):structuredClone(operations)) as unknown as InternalTableDeploymentOperationRecord[];
  return {status:'compiled',bundle,document,diagnostics:[],operations:copiedOperations};
 }catch(error){
  if(error instanceof UmfError)return {status:'blocked',diagnostics:[{code:error.code,path:error.path,message:error.message,severity:'error'}]};
  if(error instanceof Error&&['INPUT','LIMIT'].includes(error.message))return {status:'blocked',diagnostics:[{code:'TABLE_DEPLOYMENT_INPUT',path:'',message:'Invalid Unicode or source resource limit',severity:'error'}]};
  throw error;
 }
}
/** Private R2 verifier: all JSON source/configuration/compiler leaves share one meter. */
export function verifyTableDeploymentWithAccounting(input:TableDeploymentBundle,accounting:AccountingContext):{bundle:TableDeploymentBundle;document:import('../model/types').Document;operations:InternalTableDeploymentOperationRecord[]}{
 if(!input||!['umf.table-deployment/0.1','umf.table-deployment/0.2'].includes(input.version)||!input.source)deploymentError('Unknown deployment bundle');
 if(input.source.format!=='json')deploymentError('Metered R2 deployment accepts JSON source only','/source/format');
 const result=compileDeploymentInternal({text:input.source.utf8,format:input.source.format,configuration:input.configuration},input.version==='umf.table-deployment/0.1',accounting);
 if(result.status!=='compiled'||canonicalCharged(input,accounting,'/bundle/input')!==canonicalCharged(result.bundle,accounting,'/bundle/verified'))deploymentError('Deployment differs from exact source recompilation');
 return {bundle:result.bundle,document:result.document,operations:result.operations};
}
/** Recompile complete source/configuration; self-consistent forged SQL is not authority. */
export function verifyTableDeployment(input:unknown):TableDeploymentBundle{
 const value=copyJson(input) as unknown as TableDeploymentBundle;
 if(!value||!['umf.table-deployment/0.1','umf.table-deployment/0.2'].includes(value.version)||!value.source)deploymentError('Unknown deployment bundle');
 const result=compileDeployment({text:value.source.utf8,format:value.source.format,configuration:value.configuration},value.version==='umf.table-deployment/0.1');
 if(result.status!=='compiled'||canonical(value)!==canonical(result.bundle))deploymentError('Deployment differs from exact source recompilation');
 return result.bundle;
}

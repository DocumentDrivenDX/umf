// SPDX-License-Identifier: MIT OR Apache-2.0
/** Inert JSON boundary. This entry has no host APIs or imports selected by input. */
import './polyfills';
import {generatePythonClient,type PythonClientRequest} from '../../src/access';
import {compileTableDeployment,verifyTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,verifyTableMigration,discoverTableMigrationChanges} from '../../src/table-migration';
import {normalizeRowScope} from '../../src/table-authoring/row-scope';
import {inspectTableLifecycle} from '../../src/extensions/tables';
import {copyJson} from '../../src/model/json';
Object.assign(globalThis,{__umf_codegen(input:string):string {
 try {return JSON.stringify({ok:true,result:generatePythonClient(JSON.parse(input) as PythonClientRequest)});}
 catch(error){const e=error as {code?:string;message?:string;path?:string};return JSON.stringify({ok:false,error:{code:e.code??'GENERATION_FAILED',message:e.message??'Generation refused',...(e.path===undefined?{}:{path:e.path})}});}
}});
Object.assign(globalThis,{__umf_table_migrate(input:string):string {
 try {return JSON.stringify({ok:true,result:compileTableMigration(JSON.parse(input))});}
 catch(error){const e=error as {code?:string;message?:string;path?:string};return JSON.stringify({ok:false,error:{code:e.code??'MIGRATION_FAILED',message:e.message??'Migration compilation refused',...(e.path===undefined?{}:{path:e.path})}});}
},__umf_table_migration_verify(input:string):string {
 try {return JSON.stringify({ok:true,result:verifyTableMigration(JSON.parse(input).plan)});}
 catch(error){const e=error as {code?:string;message?:string;path?:string};return JSON.stringify({ok:false,error:{code:e.code??'MIGRATION_INVALID',message:e.message??'Migration verification refused',...(e.path===undefined?{}:{path:e.path})}});}
},__umf_table_migration_changes(input:string):string {
 try {
  const request=JSON.parse(input);
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).sort().join(',')!=='next,previous')throw new Error('Expected exact previous and next deployment bundle members');
  const previous=verifyTableDeployment(request.previous),next=verifyTableDeployment(request.next);
  return JSON.stringify({ok:true,result:{changes:discoverTableMigrationChanges(previous,next)}});
 } catch(error){const e=error as {code?:string;message?:string;path?:string};return JSON.stringify({ok:false,error:{code:e.code??'MIGRATION_CHANGES_FAILED',message:e.message??'Reviewed change discovery refused',...(e.path===undefined?{}:{path:e.path})}});}
}});
Object.assign(globalThis,{__umf_table_deploy(input:string):string {
 try {return JSON.stringify({ok:true,result:compileTableDeployment(JSON.parse(input))});}
 catch(error){const e=error as {code?:string;message?:string;path?:string};return JSON.stringify({ok:false,error:{code:e.code??'DEPLOYMENT_FAILED',message:e.message??'Deployment compilation refused',...(e.path===undefined?{}:{path:e.path})}});}
},__umf_table_verify(input:string):string {
 try {return JSON.stringify({ok:true,result:verifyTableDeployment(JSON.parse(input).bundle)});}
 catch(error){const e=error as {code?:string;message?:string;path?:string};return JSON.stringify({ok:false,error:{code:e.code??'DEPLOYMENT_INVALID',message:e.message??'Deployment verification refused',...(e.path===undefined?{}:{path:e.path})}});}
}});

Object.assign(globalThis,{__umf_row_scope(input:string):string {
 try {
  const request=JSON.parse(input),context=request.context;
  const admission=(policy:any)=>{
   const document=copyJson(context.lifecycleDocument) as any,module=document.modules.find((m:any)=>m.id===context.record.module);
   const payload=module?.extensions?.['umf.tables'],table=payload?.tables?.find((t:any)=>t.id===context.tableId);
   if(!table)return [{code:'ROW_SCOPE_ADMISSION_TARGET',path:'/context/tableId',message:'Lifecycle table target was not found'}];
   table.policy=policy;const inspection=inspectTableLifecycle(document);
   const diagnostics=inspection.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message}));
   if(!inspection.valid||!inspection.complete)return diagnostics;
   const deployment=compileTableDeployment({text:JSON.stringify(document),configuration:context.deploymentConfiguration});
   if(deployment.status==='blocked')diagnostics.push(...deployment.diagnostics.map((d:any)=>({code:d.code,path:d.path,message:d.message})));
   return diagnostics;
  };
  const result=normalizeRowScope(request.input,{...context,admitPolicy:admission});
  return JSON.stringify({ok:true,result});
 } catch(error) {const e=error as {code?:string;message?:string;path?:string};return JSON.stringify({ok:false,error:{code:e.code??'ROW_SCOPE_FAILED',message:e.message??'Row scope normalization refused',...(e.path===undefined?{}:{path:e.path})}});}
}});

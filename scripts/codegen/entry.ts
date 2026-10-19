// SPDX-License-Identifier: MIT OR Apache-2.0
/** Inert JSON boundary. This entry has no host APIs or imports selected by input. */
import './polyfills';
import {generatePythonClient,type PythonClientRequest} from '../../src/access';
import {compileTableDeployment,verifyTableDeployment} from '../../src/table-deployment';
import {compileTableMigration,verifyTableMigration} from '../../src/table-migration';
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
}});
Object.assign(globalThis,{__umf_table_deploy(input:string):string {
 try {return JSON.stringify({ok:true,result:compileTableDeployment(JSON.parse(input))});}
 catch(error){const e=error as {code?:string;message?:string;path?:string};return JSON.stringify({ok:false,error:{code:e.code??'DEPLOYMENT_FAILED',message:e.message??'Deployment compilation refused',...(e.path===undefined?{}:{path:e.path})}});}
},__umf_table_verify(input:string):string {
 try {return JSON.stringify({ok:true,result:verifyTableDeployment(JSON.parse(input).bundle)});}
 catch(error){const e=error as {code?:string;message?:string;path?:string};return JSON.stringify({ok:false,error:{code:e.code??'DEPLOYMENT_INVALID',message:e.message??'Deployment verification refused',...(e.path===undefined?{}:{path:e.path})}});}
}});

// SPDX-License-Identifier: MIT OR Apache-2.0
/** Inert JSON boundary. This entry has no host APIs or imports selected by input. */
import './polyfills';
import {generatePythonClient,type PythonClientRequest} from '../../src/access';
Object.assign(globalThis,{__umf_codegen(input:string):string {
 try {return JSON.stringify({ok:true,result:generatePythonClient(JSON.parse(input) as PythonClientRequest)});}
 catch(error){const e=error as {code?:string;message?:string;path?:string};return JSON.stringify({ok:false,error:{code:e.code??'GENERATION_FAILED',message:e.message??'Generation refused',...(e.path===undefined?{}:{path:e.path})}});}
}});

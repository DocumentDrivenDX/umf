// SPDX-License-Identifier: MIT OR Apache-2.0
import manifest from '../../../spec/extensions/dashboard/package.json';
import {UmfError} from '../../model/errors';
import type {Document,Diagnostic,ExtensionPackage,Json,Validation} from '../../model/types';
import type {Registry} from '../../registry/registry';
import type {DashboardDefinition} from './index';

type Operation=(fields?:Record<string,unknown>)=>unknown;
export type DashboardRustEngine={['dashboard-public']:Record<'inspectDashboard'|'readDashboardDocument'|'writeDashboardDocument'|'getDashboardDefinition'|'validateDashboardSemantics',Operation>};
type Editor=(document:Document,registry:Registry,module:string,element:string,extension:string,update:(payload:Json)=>Json)=>Document;
const packageValue=manifest as unknown as ExtensionPackage;
const CONTROL=new Set(['RESOURCE_LIMIT','LIMIT','CAPACITY','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createDashboardRustDefault(engine:DashboardRustEngine,isNativeError:(error:unknown)=>boolean,createRegistry:()=>Registry,editExtension:Editor){
 const call=<T>(operation:keyof DashboardRustEngine['dashboard-public'],fields:Record<string,unknown>):T=>{
  try{return engine['dashboard-public'][operation](fields) as T;}
  catch(error){if(!isNativeError(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code))throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'');}
 };
 const semantic=(payload:Json,context:{document:Document;path:string;scope:string}):Diagnostic[]=>call('validateDashboardSemantics',{payload,document:context.document,path:context.path,scope:context.scope}) as Diagnostic[];
 const registerDashboard=(registry:Registry):Registry=>registry.register(packageValue,semantic);
 const dashboardRegistry=():Registry=>registerDashboard(createRegistry());
 return Object.freeze({registerDashboard,dashboardRegistry,
  inspectDashboard(document:Document):Validation{return call('inspectDashboard',{document}) as Validation;},
  readDashboardDocument(source:string,format:'json'|'yaml'='yaml'):Document{return call('readDashboardDocument',{source,format}) as Document;},
  writeDashboardDocument(document:Document,format:'json'|'yaml'='yaml'):string{return call('writeDashboardDocument',{document,format}) as string;},
  getDashboardDefinition(document:Document,module:string,element:string):DashboardDefinition{return call('getDashboardDefinition',{document,module,element}) as DashboardDefinition;},
  editDashboardDefinition(document:Document,module:string,element:string,update:(definition:DashboardDefinition)=>DashboardDefinition):Document{return editExtension(document,dashboardRegistry(),module,element,'umf.dashboard',value=>update(value as unknown as DashboardDefinition) as unknown as Json);},
 });
}

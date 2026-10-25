// SPDX-License-Identifier: MIT OR Apache-2.0
import type {PythonClientRequest} from './rust-candidate';
import {PYTHON_CLIENT_HOST_ABORT_V3, type PythonClientHostReadEventV3} from './rust-host-reads-v3';

export const PYTHON_CLIENT_HOST_READ_V4_PROFILE='umf.python-client-host-read/4';
type V4SelectionEvent='SelectRecordsStart'|'SelectRecordAt'|'SelectActionsStart'|'SelectActionAt';

const keywords=new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' '));
const shadowedPackageModules=new Set('uuid decimal typing dataclasses datetime base64 re json enum collections'.split(' '));
const packagePattern=/^[a-z][a-z0-9_]*$/;
const arrayIsArray=Array.isArray;
const freeze=Object.freeze;
const apply=Reflect.apply;
const nativeRegExpTest=RegExp.prototype.test;
const regexpTest=(pattern:RegExp,value:string):boolean=>apply(nativeRegExpTest,pattern,[value]);
const isSafeInteger=Number.isSafeInteger.bind(Number);
const toString=String;
const toNumber=Number;
const NativeTypeError=TypeError;
const nativeStringIndexOf=String.prototype.indexOf;
const nativeStringSlice=String.prototype.slice;
const stringIndexOf=(value:string,search:string):number=>apply(nativeStringIndexOf,value,[search]);
const stringSlice=(value:string,start:number,end?:number):string=>apply(nativeStringSlice,value,[start,end]);

function resourceLimit(path:'records'|'actions') {
 return freeze({kind:'umf.host-resource-limit/4',path});
}

/** Synchronous, call-scoped V4 host reads. The request stays opaque in this closure. */
export function createPythonClientHostReadV4(request:PythonClientRequest) {
 let aborted=false,thrownValue:unknown;
 let records:unknown,recordLength=0,actions:unknown,actionLength=0;
 const startSelection=(refs:unknown,path:'records'|'actions'):unknown=>{
  if(refs==null)return null;
  if(!arrayIsArray(refs))throw new NativeTypeError('Selection must be an array');
  const array=refs as any;
  const length=array.length;
  if(!isSafeInteger(length)||length<0)throw new NativeTypeError('Selection length is invalid');
  if(path==='records'){records=array;recordLength=length;}else{actions=array;actionLength=length;}
  return toString(length);
 };
 const selectionAt=(list:unknown,length:number,key:'element'|'action',path:'records'|'actions',argument?:string):unknown=>{
  if(typeof argument!=='string'||!regexpTest(/^(0|[1-9][0-9]*):(0|[1-9][0-9]*)$/,argument))throw new NativeTypeError('Selection index/budget is invalid');
  const separator=stringIndexOf(argument,':');
  const index=toNumber(stringSlice(argument,0,separator));
  const remaining=toNumber(stringSlice(argument,separator+1));
  if(!isSafeInteger(index)||index<0||index>=length||!isSafeInteger(remaining)||remaining<0)throw new NativeTypeError('Selection index/budget is outside its captured range');
  const ref=(list as any)[index];
  const value=ref.module+'.'+ref[key];
  if(value.length>remaining)return resourceLimit(path);
  return value;
 };
 const read=(event:PythonClientHostReadEventV3|V4SelectionEvent,argument?:string):unknown=>{
  if(aborted)return PYTHON_CLIENT_HOST_ABORT_V3;
  try{
   switch(event){
    case 'InitialPackage':return !request||typeof request.text!=='string'||!request.package||!regexpTest(packagePattern,request.package)||keywords.has(request.package)||shadowedPackageModules.has(request.package);
    case 'ParseText':return request.text;
    case 'ParseFormat':{const format=request.format;return format==null||format==='json'?'json':'yaml';}
    case 'DigestText':return request.text;
    case 'SelectRecordsStart':return startSelection(request.records,'records');
    case 'SelectRecordAt':return selectionAt(records,recordLength,'element','records',argument);
    case 'NativeFormat':return (request.format??'json')==='json';
    case 'SelectActionsStart':return startSelection(request.actions,'actions');
    case 'SelectActionAt':return selectionAt(actions,actionLength,'action','actions',argument);
    case 'OutputPackageSuffix':return request.package+(argument??'');
    case 'OutputSourceText':return request.text;
    default:throw new NativeTypeError(`Unknown V4 host-read event: ${toString(event)}`);
   }
  }catch(error){aborted=true;thrownValue=error;return PYTHON_CLIENT_HOST_ABORT_V3;}
 };
 return freeze({read,isAborted:()=>aborted,rethrowIfAborted(){if(aborted)throw thrownValue;}});
}

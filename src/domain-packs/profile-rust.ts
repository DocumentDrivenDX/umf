// SPDX-License-Identifier: MIT OR Apache-2.0
// Default Node and browser wrapper. The TypeScript reference remains available
// through the explicit ./reference route.
import {copyJson} from '../model/json';
import {UmfError} from '../model/types';

type Inspection={valid:boolean;complete:boolean;diagnostics:string[]};
function wireJson(value:any):string {
  if(value===null)return 'null';
  if(typeof value==='string'||typeof value==='number')return JSON.stringify(value);
  if(typeof value==='boolean')return value?'true':'false';
  if(Array.isArray(value))return `[${value.map(wireJson).join(',')}]`;
  const fields:string[]=[];
  for(const key of Object.keys(value))fields.push(`${JSON.stringify(key)}:${wireJson(value[key])}`);
  return `{${fields.join(',')}}`;
}

/** Bind both public profile APIs to a UTF-16-preserving Rust wire operation. */
export function createDomainPackProfileInspectionOperation(inspectWire:(inputJson:string)=>string) {
  if(typeof inspectWire!=='function')throw new TypeError('A Rust domain-pack profile inspector is required');
  function inspectDomainPack(input:unknown):Inspection {
    let wire:string;
    try { wire=wireJson(copyJson(input)); }
    catch(error) { return {valid:false,complete:false,diagnostics:[String(error)]}; }
    let result:string;
    try { result=inspectWire(wire); }
    catch { return {valid:false,complete:false,diagnostics:['Malformed execution profile']}; }
    if(typeof result!=='string')throw new TypeError('Rust domain-pack profile inspector returned a non-string result');
    return JSON.parse(result) as Inspection;
  }
  function requireDomainPackProfile(input:unknown):Inspection {
    const result=inspectDomainPack(input);
    if(!result.valid)throw new UmfError('DOMAIN_PACK_PROFILE',result.diagnostics.join('; '));
    return result;
  }
  Object.defineProperty(inspectDomainPack,'name',{value:'inspectDomainPack'});
  Object.defineProperty(requireDomainPackProfile,'name',{value:'requireDomainPackProfile'});
  return {inspectDomainPack,requireDomainPackProfile};
}

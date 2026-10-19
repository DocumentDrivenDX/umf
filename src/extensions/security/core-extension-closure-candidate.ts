// SPDX-License-Identifier: MIT OR Apache-2.0
/** Private, locally issued extension semantics. Neither provenance nor authority. */
import {Registry} from '../../registry/registry';
import {registerActions,actionsPackage} from '../actions';
import {copyJson} from '../../model/json';
import {canonicalSchemaJson} from '../../model/schema-literals';
const closures=new WeakSet<object>();
function freeze(value:any):any{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
const originalPackage=freeze(copyJson(actionsPackage)),packageIdentity=canonicalSchemaJson(originalPackage);
function requireOriginalPackage():void{if(canonicalSchemaJson(copyJson(actionsPackage))!==packageIdentity)throw Error('SECURITY_CORE_EXTENSION_PACKAGE_CHANGED');}
/** Closed first subset: original actions0.1, explicitly requested by the owner. */
export function createCandidateCoreExtensionClosure(selection:readonly {id:string;version:string}[]):unknown{
 const selected:any=copyJson(selection);
 if(!Array.isArray(selected)||selected.length!==1||Object.keys(selected[0]??{}).sort().join(',')!=='id,version'||selected[0]!.id!=='umf.actions'||selected[0]!.version!=='0.1.0')throw Error('SECURITY_CORE_EXTENSION_CLOSURE_UNSUPPORTED');
 requireOriginalPackage();
 const handle=freeze({kind:'candidate-core-extension-closure/0.1',complete:false,authority:false,packages:[originalPackage],semantics:[{id:'umf.actions',version:'0.1.0',implementation:'original-registerActions'}]});
 closures.add(handle);return handle;
}
export function requireCandidateCoreExtensionRegistry(handle:unknown):Registry{
 if(!handle||typeof handle!=='object'||!closures.has(handle))throw Error('SECURITY_CORE_EXTENSION_CLOSURE_UNISSUED');
 requireOriginalPackage();const registry=registerActions(new Registry());
 if(canonicalSchemaJson(registry.get('umf.actions','0.1.0')!.manifest)!==packageIdentity)throw Error('SECURITY_CORE_EXTENSION_PACKAGE_CHANGED');
 return registry;
}

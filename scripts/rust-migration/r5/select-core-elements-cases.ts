// SPDX-License-Identifier: MIT OR Apache-2.0
import {selectCoreElements} from '../../../src/model/selection';
import {Registry} from '../../../src/registry/registry';
import {UmfError,type Document,type ExtensionPackage} from '../../../src/model/types';

const mixed:Document={umf:'0.10.0',id:'selection-baseline',vocabularies:{'future.meaning':{version:'1.0.0'}},extensions:{'future.meaning':{opaque:'retain'}},modules:[
 {id:'sales',namespace:'sales',elements:[{id:'customer',name:'Customer',scalarType:'integer',extensions:{'future.meaning':{opaque:'keep'}},references:[{role:'account',module:'billing',element:'account',future:'annotation'},{role:'account',module:'billing',element:'account'}]}]},
 {id:'support',namespace:'support',elements:[{id:'customer',name:'Customer',scalarType:'future-scalar',extensions:{}}]},
 {id:'billing',namespace:'billing',elements:[{id:'account',name:'AccountHolder',scalarType:'string',extensions:{},references:[{role:'owner',module:'sales',element:'customer',future:'cycle annotation'}]}]}
]};
const summarizeError=(error:unknown)=>({name:error instanceof Error?error.name:typeof error,code:error instanceof UmfError?error.code:undefined,message:error instanceof Error?error.message:String(error)});

export function captureSelection():unknown {
 const selected=selectCoreElements(mixed,{references:'none',names:['Customer']});
 const closure=selectCoreElements(mixed,{references:'transitive',identities:[{module:'sales',element:'customer'}]});
 const callbackOrder:string[]=[];
 const manifest:ExtensionPackage={id:'capture.callback',version:'1.0.0',coreVersion:'0.10.0',description:'Capture-only callback probe',schema:{type:'object'},semantics:'Capture callback scope and order',scopes:['document','module','element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
 const callbackDoc:Document={umf:'0.10.0',id:'callbacks',vocabularies:{'capture.callback':{version:'1.0.0'}},extensions:{'capture.callback':{at:'document'}},modules:[{id:'m',namespace:'n',extensions:{'capture.callback':{at:'module'}},elements:[{id:'e',extensions:{'capture.callback':{at:'element'}}}]}]};
 const registry=new Registry().register(manifest,(_payload,context)=>{callbackOrder.push(`${context.scope}:${context.path}`);return [];});
 selectCoreElements(callbackDoc,{references:'none'},registry);
 let getterCalls=0;
 const accessorQuery=Object.defineProperty({references:'none'},'names',{enumerable:true,get(){getterCalls++;return ['Customer'];}});
 let accessorError:unknown;
 try{selectCoreElements(mixed,accessorQuery as any);}catch(error){accessorError=error;}
 const accessOrder:string[]=[];
 const observedSource=new Proxy({umf:'0.10.0',id:'order',vocabularies:{},modules:[]} as Document,{getPrototypeOf(target){accessOrder.push('getPrototypeOf');return Object.getPrototypeOf(target);},ownKeys(target){accessOrder.push('ownKeys');return Reflect.ownKeys(target);},getOwnPropertyDescriptor(target,key){accessOrder.push(`descriptor:${String(key)}`);return Reflect.getOwnPropertyDescriptor(target,key);}});
 selectCoreElements(observedSource,{references:'none'});
 const sentinel={identity:'sentinel'};
 const proxied=new Proxy({}, {getPrototypeOf(){throw sentinel;}});
 let thrownIdentity=false;
 try{selectCoreElements(proxied as Document,{references:'none'});}catch(error){thrownIdentity=error===sentinel;}
 const cyclic:any={...mixed};cyclic.future=cyclic;
 let cycleError:unknown;
 try{selectCoreElements(cyclic,{references:'none'});}catch(error){cycleError=error;}
 let controlError:unknown;
 try{selectCoreElements(mixed,{references:'none',signal:'cancel',budget:1} as any);}catch(error){controlError=error;}
 return {
  successful:{scope:selected.scope,referenceScope:selected.referenceScope,selection:selected.selection.map(x=>({module:x.module,namespace:x.namespace,path:x.path,id:x.element.id,includedBy:x.includedBy})),boundaryReferences:selected.boundaryReferences.map(x=>({from:x.from,targetPath:x.targetPath,reference:x.reference})),diagnostics:selected.sourceValidation.diagnostics,complete:selected.sourceValidation.complete},
  transitive:{selection:closure.selection.map(x=>({module:x.module,id:x.element.id,includedBy:x.includedBy})),boundaryReferences:closure.boundaryReferences},
  callbacks:{order:callbackOrder},
  accessor:{error:summarizeError(accessorError),getterCalls},
  accessOrder,
  thrownValueIdentity:{sameObject:thrownIdentity},
  cycle:{error:summarizeError(cycleError)},
  unknownAnnotations:{edge:selected.boundaryReferences[0]?.reference.future,sourceElement:mixed.modules[0]?.elements[0]?.extensions},
  controls:{extraQuery:errorCode(controlError),hasCancellationOrWorkBudgetParameter:false},
 };
}
function errorCode(error:unknown):string|undefined{return error instanceof UmfError?error.code:undefined;}

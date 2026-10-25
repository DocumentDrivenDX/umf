// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError,pointer} from '../model/errors';
import type {AccountingContext} from '../model/internal/accounting-context';

export type InventoryComponentJson=null|boolean|number|string|InventoryComponentJson[]|{[key:string]:InventoryComponentJson};
function quotedJsonBytes(value:string):number{
 let bytes=2;
 for(let i=0;i<value.length;i++){
  const unit=value.charCodeAt(i);
  if(unit===0x22||unit===0x5c||unit===0x08||unit===0x09||unit===0x0a||unit===0x0c||unit===0x0d){bytes+=2;continue;}
  if(unit<0x20){bytes+=6;continue;}
  if(unit>=0xd800&&unit<=0xdbff){const low=value.charCodeAt(++i);if(!(low>=0xdc00&&low<=0xdfff))throw new UmfError('NON_JSON','Inventory request contains invalid Unicode.');bytes+=4;continue;}
  if(unit>=0xdc00&&unit<=0xdfff)throw new UmfError('NON_JSON','Inventory request contains invalid Unicode.');
  bytes+=unit<0x80?1:unit<0x800?2:3;
 }
 return bytes;
}
/** Existing descriptor-safe, component-bounded owner copy shared by .2 history custody. */
export function ownCanonicalComponent(input:unknown,path:string,maxBytes:number,accounting?:AccountingContext):InventoryComponentJson{
 type PathRef={parent:PathRef|null;segment:string};
 type Frame={source:object;target:InventoryComponentJson[]|Record<string,InventoryComponentJson>;keys:string[]|null;index:number;array:boolean;path:PathRef};
 type Task={kind:'value';value:unknown;path:PathRef;assign:(value:InventoryComponentJson)=>void}|{kind:'resume';frame:Frame};
 const rootPath:PathRef={parent:null,segment:path};
 const childPath=(parent:PathRef,segment:string):PathRef=>({parent,segment});
 const displayPath=(ref:PathRef):string=>{const parts:string[]=[];let current:PathRef|null=ref;while(current?.parent){parts.push(pointer(current.segment));current=current.parent;}return (current?.segment??path)+parts.reverse().map(part=>`/${part}`).join('');};
 let bytes=0;const active=new Set<object>(),root:InventoryComponentJson[]=[null];
 const add=(amount:number,at:PathRef):void=>{bytes+=amount;if(bytes>maxBytes)throw new UmfError('LIMIT','Inventory request component exceeds its existing byte bound.',displayPath(at));};
 const countString=(value:string,at:PathRef):void=>add(quotedJsonBytes(value),at);
 const tasks:Task[]=[{kind:'value',value:input,path:rootPath,assign:value=>{root[0]=value;}}];
 while(tasks.length){
  const task=tasks.pop()!;
  accounting?.visit('inventory-component-copy-task',path);
  if(task.kind==='resume'){
   const frame=task.frame,count=frame.array?(frame.source as unknown[]).length:frame.keys!.length;
   if(frame.index>=count){active.delete(frame.source);continue;}
   const key=frame.array?frame.index++:frame.keys![frame.index++]!,property=String(key),descriptor=Object.getOwnPropertyDescriptor(frame.source,property);accounting?.visit(frame.array?'inventory-component-array-slot':'inventory-component-object-key',displayPath(frame.path));if(!frame.array)accounting?.scanUtf8(property,displayPath(frame.path));
   if(!descriptor||!descriptor.enumerable||!('value'in descriptor))throw new UmfError('NON_JSON','Inventory request contains hidden fields or accessors.',displayPath(childPath(frame.path,property)));
   tasks.push(task);
   tasks.push({kind:'value',value:descriptor.value,path:childPath(frame.path,property),assign:item=>{if(frame.array)(frame.target as InventoryComponentJson[])[key as number]=item;else Object.defineProperty(frame.target,property,{value:item,enumerable:true,writable:true,configurable:true});}});
   continue;
  }
  const {value,path:at,assign}=task;
  if(value===null){add(4,at);assign(null);continue;}
  if(typeof value==='boolean'){add(value?4:5,at);assign(value);continue;}
  if(typeof value==='string'){countString(value,at);accounting?.scanUtf8(value,displayPath(at));assign(value);continue;}
  if(typeof value==='number'){
   if(!Number.isFinite(value))throw new UmfError('NUMBER','Inventory request contains a non-finite number.',displayPath(at));
   add(JSON.stringify(value).length,at);assign(value);continue;
  }
  if(typeof value!=='object')throw new UmfError('NON_JSON','Inventory request contains a non-JSON value.',displayPath(at));
  if(active.has(value))throw new UmfError('CYCLE','Inventory request contains a cycle.',displayPath(at));
  const array=Array.isArray(value),prototype=Object.getPrototypeOf(value);accounting?.visit('inventory-component-container',displayPath(at));
  if(array?prototype!==Array.prototype:prototype!==Object.prototype&&prototype!==null)throw new UmfError('NON_JSON','Inventory request contains a custom object.',displayPath(at));
  if(Object.getOwnPropertySymbols(value).length)throw new UmfError('NON_JSON','Inventory request contains symbol properties.',displayPath(at));
  if(array&&value.length>maxBytes-bytes-2)throw new UmfError('LIMIT','Inventory request array exceeds its existing byte bound.',displayPath(at));
  const names=Object.getOwnPropertyNames(value);
  if(array){
   if(names.length!==value.length+1||names.some(name=>name!=='length'&&(!/^(0|[1-9][0-9]*)$/.test(name)||Number(name)>=value.length)))throw new UmfError('NON_JSON','Inventory request contains a sparse array or non-index property.',displayPath(at));
   add(2+(value.length?value.length-1:0),at);
  }else{
   if(names.length>Math.floor((maxBytes-bytes)/4))throw new UmfError('LIMIT','Inventory request object exceeds its existing byte bound.',displayPath(at));
   names.sort();add(2+(names.length?names.length-1:0),at);
   for(const key of names){add(quotedJsonBytes(key)+1,childPath(at,key));accounting?.visit('inventory-component-key-preflight',displayPath(at));accounting?.scanUtf8(key,displayPath(at));}
  }
  active.add(value);
  const target:InventoryComponentJson[]|Record<string,InventoryComponentJson>=array?new Array(value.length):Object.create(null);
  assign(target as InventoryComponentJson);
  const frame:Frame={source:value,target,keys:array?null:names,index:0,array,path:at};
  tasks.push({kind:'resume',frame});
 }
 return root[0]!;
}
